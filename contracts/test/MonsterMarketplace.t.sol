// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {MonsterTypesV1} from "../src/lib/MonsterTypesV1.sol";
import {MonsterNFT} from "../src/MonsterNFT.sol";
import {MonsterMarketplace} from "../src/MonsterMarketplace.sol";

/// @dev Rejects every ERC-721 receipt, so a safe transfer to it always reverts.
contract RejectingReceiver {
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        revert("receiver rejects transfer");
    }
}

/// @dev Seller that rejects native payment; used to prove PaymentFailed rollback.
contract RejectingSeller {
    receive() external payable {
        revert("seller rejects payment");
    }
}

/// @dev Buyer that reenters buy from the ERC721Receiver callback while the
///      first settlement is still in flight. The listing is already deleted,
///      so the nested buy must fail without distorting the outer settlement.
contract ReentrantBuyer {
    MonsterMarketplace private immutable marketplace;
    uint256 private attackTokenId;
    bool private attacked;

    constructor(MonsterMarketplace marketplace_) {
        marketplace = marketplace_;
    }

    function attack(uint256 tokenId) external {
        attackTokenId = tokenId;
        // Spend this contract's own dealt balance so the nested attempt in the
        // receiver callback still holds funds and reaches the listing check.
        marketplace.buy{value: 1 ether}(tokenId);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        if (!attacked) {
            attacked = true;
            // Listing is deleted before external calls, so the nested same-token
            // buy reverts ListingNotFound and must not abort the outer call.
            try marketplace.buy{value: 1 ether}(attackTokenId) {
                assert(false);
            } catch {}
        }
        return this.onERC721Received.selector;
    }
}

/// @dev Seller that attempts a reentrant buy of a DIFFERENT listing while
///      receiving its own native payment mid-settlement. Unlike the deleted
///      own listing, that listing still exists and is fully executable, so
///      only the nonReentrant guard can block this attack.
contract ReentrantSeller {
    MonsterMarketplace private immutable marketplace;
    uint256 private attackTokenId;

    constructor(MonsterMarketplace marketplace_) {
        marketplace = marketplace_;
    }

    /// @notice Target of the nested attack; must be a live executable listing.
    function setAttackTokenId(uint256 tokenId) external {
        attackTokenId = tokenId;
    }

    /// @notice Plain receiver hook: the reentrancy attack lives in receive().
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    receive() external payable {
        // Mid-settlement: own listing already deleted, but the attack token's
        // listing is live and executable. nonReentrant must reject this buy.
        try marketplace.buy{value: 1 ether}(attackTokenId) {
            assert(false);
        } catch {}
    }
}

contract MonsterMarketplaceTest is Test {
    MonsterNFT internal nft;
    MonsterMarketplace internal marketplace;
    address internal factory = makeAddr("factory");
    address internal seller = makeAddr("seller");
    address internal buyer = makeAddr("buyer");

    function setUp() public {
        nft = new MonsterNFT(factory, "Origin Duel Monster", "ODM");
        marketplace = new MonsterMarketplace(nft);
        vm.prank(factory);
        nft.mintFromFactory(0, seller, _monster(), "ipfs://token/0");
        // In this Foundry version, {value:} on a pranked call is drawn from the
        // pranked address, so every caller that sends a buy payment needs funds.
        vm.deal(buyer, 100 ether);
        vm.deal(seller, 100 ether);
    }

    function _monster() private pure returns (MonsterTypesV1.ResolvedMonsterV1 memory) {
        return MonsterTypesV1.ResolvedMonsterV1({
            speciesId: 7,
            level: 2,
            atk: 1000,
            def: 1000,
            element: 1,
            rarity: 0,
            transactionDNA: 0x03c4594447d168c8bf50701a468dfb08d85e06f4496f3315d6359f134ede6da8,
            sourceTx: 0xe8a1a631557a4b63768f2ea5dd7714f825ab39416d3e753c848e50e39dd24bab
        });
    }

    function _listToken0(uint256 price) internal {
        vm.prank(seller);
        nft.approve(address(marketplace), 0);
        vm.prank(seller);
        marketplace.list(0, price);
    }

    function _listTokenId(uint256 tokenId, address tokenOwner, uint256 price) internal {
        vm.startPrank(tokenOwner);
        nft.approve(address(marketplace), tokenId);
        marketplace.list(tokenId, price);
        vm.stopPrank();
    }

    function testOwnerCanListApprovedNFT() public {
        vm.prank(seller);
        nft.approve(address(marketplace), 0);
        vm.prank(seller);
        vm.expectEmit(true, true, true, true, address(marketplace));
        emit MonsterMarketplace.Listed(0, seller, 1 ether);
        marketplace.list(0, 1 ether);

        MonsterMarketplace.ListingViewV1 memory listing = marketplace.listingOf(0);
        assertEq(listing.seller, seller);
        assertEq(listing.price, 1 ether);
        assertTrue(listing.exists);
    }

    function testNonOwnerListRejectsNotTokenOwner() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(MonsterMarketplace.NotTokenOwner.selector, 0, buyer));
        marketplace.list(0, 1 ether);
    }

    function testZeroPriceRejectsInvalidListingPrice() public {
        vm.prank(seller);
        nft.approve(address(marketplace), 0);
        vm.prank(seller);
        vm.expectRevert(MonsterMarketplace.InvalidListingPrice.selector);
        marketplace.list(0, 0);
    }

    function testListWithoutApprovalRejectsMarketplaceNotApproved() public {
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(MonsterMarketplace.MarketplaceNotApproved.selector, 0));
        marketplace.list(0, 1 ether);
    }

    function testOperatorApprovalPathAccepted() public {
        vm.prank(seller);
        nft.setApprovalForAll(address(marketplace), true);
        vm.prank(seller);
        marketplace.list(0, 1 ether);

        assertTrue(marketplace.listingOf(0).exists);
    }

    function testSingleListingStoredExactly() public {
        _listToken0(1 ether);
        MonsterMarketplace.ListingViewV1 memory listing = marketplace.listingOf(0);
        assertEq(listing.seller, seller);
        assertEq(listing.price, 1 ether);
        assertTrue(listing.executable);
    }

    function testSellerCanCancel() public {
        _listToken0(1 ether);
        vm.prank(seller);
        vm.expectEmit(true, true, true, true, address(marketplace));
        emit MonsterMarketplace.ListingCancelled(0, seller);
        marketplace.cancel(0);

        MonsterMarketplace.ListingViewV1 memory listing = marketplace.listingOf(0);
        assertEq(listing.seller, address(0));
        assertFalse(listing.exists);
    }

    function testNonSellerCancelRejectsNotListingSeller() public {
        _listToken0(1 ether);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(MonsterMarketplace.NotListingSeller.selector, 0, buyer));
        marketplace.cancel(0);
    }

    function testCancelWithoutListingRejectsListingNotFound() public {
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(MonsterMarketplace.ListingNotFound.selector, 0));
        marketplace.cancel(0);
    }

    function testListingOfExecutableTrueWhileOwnerAndApprovalCurrent() public {
        _listToken0(1 ether);
        assertTrue(marketplace.listingOf(0).executable);
    }

    function testOwnerTransferMakesOldListingNotExecutable() public {
        _listToken0(1 ether);
        vm.prank(seller);
        nft.transferFrom(seller, buyer, 0);

        MonsterMarketplace.ListingViewV1 memory listing = marketplace.listingOf(0);
        assertTrue(listing.exists);
        assertFalse(listing.executable);
    }

    function testApprovalRevocationMakesListingNotExecutable() public {
        _listToken0(1 ether);
        vm.prank(seller);
        nft.approve(address(0), 0);

        MonsterMarketplace.ListingViewV1 memory listing = marketplace.listingOf(0);
        assertTrue(listing.exists);
        assertFalse(listing.executable);
    }

    function testBuyMissingListingRejectsListingNotFound() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(MonsterMarketplace.ListingNotFound.selector, 0));
        marketplace.buy{value: 1 ether}(0);
    }

    function testSelfBuyRejectsBuyerIsSellerBeforeEffects() public {
        _listToken0(1 ether);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(MonsterMarketplace.BuyerIsSeller.selector, seller));
        marketplace.buy{value: 1 ether}(0);

        // No effects escaped: listing intact, NFT unmoved, no payment moved.
        MonsterMarketplace.ListingViewV1 memory listing = marketplace.listingOf(0);
        assertTrue(listing.exists);
        assertEq(nft.ownerOf(0), seller);
        assertEq(seller.balance, 100 ether);
    }

    function testUnderpayRejectsIncorrectPayment() public {
        _listToken0(1 ether);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(MonsterMarketplace.IncorrectPayment.selector, 1 ether, 0.5 ether));
        marketplace.buy{value: 0.5 ether}(0);
    }

    function testOverpayRejectsIncorrectPayment() public {
        _listToken0(1 ether);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(MonsterMarketplace.IncorrectPayment.selector, 1 ether, 2 ether));
        marketplace.buy{value: 2 ether}(0);
    }

    function testZeroPaymentRejectsIncorrectPayment() public {
        _listToken0(1 ether);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(MonsterMarketplace.IncorrectPayment.selector, 1 ether, 0));
        marketplace.buy{value: 0}(0);
    }

    function testStaleOwnerRejectsListingStale() public {
        _listToken0(1 ether);
        vm.prank(seller);
        nft.transferFrom(seller, buyer, 0);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(MonsterMarketplace.ListingStale.selector, 0));
        marketplace.buy{value: 1 ether}(0);
    }

    function testRevokedApprovalRejectsListingStale() public {
        _listToken0(1 ether);
        vm.prank(seller);
        nft.approve(address(0), 0);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(MonsterMarketplace.ListingStale.selector, 0));
        marketplace.buy{value: 1 ether}(0);
    }

    function testSuccessfulBuyPaysExactSellerAmount() public {
        _listToken0(1 ether);
        vm.prank(buyer);
        marketplace.buy{value: 1 ether}(0);

        // Deal was 100 ether each: seller gained the exact price, buyer lost it.
        assertEq(seller.balance, 101 ether);
        assertEq(buyer.balance, 99 ether);
    }

    function testSuccessfulBuyTransfersNFTToBuyer() public {
        _listToken0(1 ether);
        vm.prank(buyer);
        marketplace.buy{value: 1 ether}(0);

        assertEq(nft.ownerOf(0), buyer);
    }

    function testSuccessfulBuyDeletesListing() public {
        _listToken0(1 ether);
        vm.prank(buyer);
        marketplace.buy{value: 1 ether}(0);

        MonsterMarketplace.ListingViewV1 memory listing = marketplace.listingOf(0);
        assertFalse(listing.exists);
        assertFalse(listing.executable);
    }

    function testSuccessfulBuyEmitsPurchased() public {
        _listToken0(1 ether);
        vm.prank(buyer);
        vm.expectEmit(true, true, true, true, address(marketplace));
        emit MonsterMarketplace.Purchased(0, seller, buyer, 1 ether);
        marketplace.buy{value: 1 ether}(0);
    }

    function testSellerPaymentReceiverRevertRollsBackEverything() public {
        // Move the token to a seller contract that rejects native payment.
        RejectingSeller rejectingSeller = new RejectingSeller();
        vm.startPrank(seller);
        nft.transferFrom(seller, address(rejectingSeller), 0);
        vm.stopPrank();
        vm.startPrank(address(rejectingSeller));
        nft.setApprovalForAll(address(marketplace), true);
        marketplace.list(0, 1 ether);
        vm.stopPrank();

        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(MonsterMarketplace.PaymentFailed.selector, address(rejectingSeller), 1 ether)
        );
        marketplace.buy{value: 1 ether}(0);

        // Atomic rollback: listing restored, NFT still with rejecting seller.
        MonsterMarketplace.ListingViewV1 memory listing = marketplace.listingOf(0);
        assertTrue(listing.exists);
        assertEq(nft.ownerOf(0), address(rejectingSeller));
    }

    function testReentrantCallbackCannotDoubleBuy() public {
        _listToken0(1 ether);
        ReentrantBuyer reentrant = new ReentrantBuyer(marketplace);
        // 2 ether: 1 for the attack, 1 so the nested attempt still passes the
        // value check and actually reaches the deleted-listing check.
        vm.deal(address(reentrant), 2 ether);
        vm.prank(address(reentrant));
        reentrant.attack(0);

        // First buy settled exactly once; the reentrant attempt inside the
        // receiver callback bought nothing and distorted nothing.
        assertEq(nft.ownerOf(0), address(reentrant));
        MonsterMarketplace.ListingViewV1 memory listing = marketplace.listingOf(0);
        assertFalse(listing.exists);
        assertEq(address(reentrant).balance, 1 ether);
        assertEq(seller.balance, 101 ether);
    }

    function testReentrantSellerPaymentCallbackCannotBuyConcurrentListing() public {
        // Token 1 sold by a seller contract whose receive() reenters buy for a
        // still-live second listing while being paid for its own sale.
        ReentrantSeller reentrantSeller = new ReentrantSeller(marketplace);
        vm.startPrank(factory);
        nft.mintFromFactory(1, address(reentrantSeller), _monster(), "ipfs://token/1");
        nft.mintFromFactory(2, seller, _monster(), "ipfs://token/2");
        vm.stopPrank();

        // Second listing stays fully executable; only nonReentrant can block it.
        vm.startPrank(address(reentrantSeller));
        nft.setApprovalForAll(address(marketplace), true);
        marketplace.list(1, 1 ether);
        vm.stopPrank();
        _listTokenId(2, seller, 1 ether);
        reentrantSeller.setAttackTokenId(2);

        vm.prank(buyer);
        // The nested attack on token 2 must fail (nonReentrant), so the outer
        // buy of token 1 completes normally.
        marketplace.buy{value: 1 ether}(1);

        assertEq(nft.ownerOf(1), buyer);
        MonsterMarketplace.ListingViewV1 memory second = marketplace.listingOf(2);
        assertTrue(second.exists);
        assertTrue(second.executable);
        assertEq(nft.ownerOf(2), seller);
        // Seller contract holds exactly its sale proceeds: the nested buy of
        // token 2 consumed no funds and transferred nothing.
        assertEq(address(reentrantSeller).balance, 1 ether);
        assertEq(buyer.balance, 99 ether);
    }

    function testRejectingReceiverBuyRollsBackAllEffects() public {
        _listToken0(1 ether);
        RejectingReceiver rejecting = new RejectingReceiver();
        vm.deal(address(rejecting), 100 ether);
        vm.prank(address(rejecting));
        vm.expectRevert("receiver rejects transfer");
        marketplace.buy{value: 1 ether}(0);

        // Atomic rollback: listing back, NFT still seller-owned, payment back.
        MonsterMarketplace.ListingViewV1 memory listing = marketplace.listingOf(0);
        assertTrue(listing.exists);
        assertEq(nft.ownerOf(0), seller);
        assertEq(address(rejecting).balance, 100 ether);
    }

    function testTwoCompetingBuyersAtMostOneSettlement() public {
        _listToken0(1 ether);
        address first = makeAddr("first");
        address second = makeAddr("second");
        vm.deal(first, 100 ether);
        vm.deal(second, 100 ether);

        vm.prank(first);
        marketplace.buy{value: 1 ether}(0);
        vm.prank(second);
        vm.expectRevert(abi.encodeWithSelector(MonsterMarketplace.ListingNotFound.selector, 0));
        marketplace.buy{value: 1 ether}(0);

        // Exactly one settlement: first buyer owns token, seller paid once.
        assertEq(nft.ownerOf(0), first);
        assertEq(seller.balance, 101 ether);
        assertEq(first.balance, 99 ether);
        assertEq(second.balance, 100 ether);
    }

    function testRejectedBuyLeavesNoPurchasedEffect() public {
        _listToken0(1 ether);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(MonsterMarketplace.IncorrectPayment.selector, 1 ether, 0));
        marketplace.buy{value: 0}(0);

        // Failed buy left no settlement trace.
        MonsterMarketplace.ListingViewV1 memory listing = marketplace.listingOf(0);
        assertTrue(listing.exists);
        assertEq(nft.ownerOf(0), seller);
    }
}
