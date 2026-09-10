// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MonsterNFT} from "./MonsterNFT.sol";

/// @title Origin Duel Fixed-Price Monster Marketplace V1
/// @notice Minimal list/cancel/buy marketplace with native CTC settlement.
///         MonsterNFT stays the sole ownership/transfer authority: every
///         state-changing path re-reads live ownership and approval instead of
///         trusting cached listing state.
contract MonsterMarketplace is ReentrancyGuard {
    error NotTokenOwner(uint256 tokenId, address caller);
    error InvalidListingPrice();
    error MarketplaceNotApproved(uint256 tokenId);
    error ListingNotFound(uint256 tokenId);
    error ListingStale(uint256 tokenId);
    error NotListingSeller(uint256 tokenId, address caller);
    error BuyerIsSeller(address buyer);
    error IncorrectPayment(uint256 expected, uint256 actual);
    error PaymentFailed(address seller, uint256 amount);

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event ListingCancelled(uint256 indexed tokenId, address indexed seller);
    event Purchased(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price);

    struct ListingV1 {
        address seller;
        uint256 price;
    }

    struct ListingViewV1 {
        address seller;
        uint256 price;
        bool exists;
        bool executable;
    }

    MonsterNFT public immutable nft;

    /// @dev One logical active listing per token: zero seller means no listing,
    ///      and a new owner-approved `list` overwrites the previous one.
    mapping(uint256 => ListingV1) private _listings;

    constructor(MonsterNFT nft_) {
        nft = nft_;
    }

    function list(uint256 tokenId, uint256 price) external {
        if (msg.sender != nft.ownerOf(tokenId)) {
            revert NotTokenOwner(tokenId, msg.sender);
        }
        if (price == 0) revert InvalidListingPrice();
        if (!_isApprovedToTransfer(tokenId, msg.sender)) revert MarketplaceNotApproved(tokenId);

        _listings[tokenId] = ListingV1({seller: msg.sender, price: price});
        emit Listed(tokenId, msg.sender, price);
    }

    function cancel(uint256 tokenId) external {
        ListingV1 memory listing = _listings[tokenId];
        if (listing.seller == address(0)) revert ListingNotFound(tokenId);
        if (msg.sender != listing.seller) revert NotListingSeller(tokenId, msg.sender);

        delete _listings[tokenId];
        emit ListingCancelled(tokenId, listing.seller);
    }

    function listingOf(uint256 tokenId) external view returns (ListingViewV1 memory listing) {
        ListingV1 memory stored = _listings[tokenId];
        bool exists = stored.seller != address(0);
        // Stale listings stay discoverable but never report executable: live
        // ownership and approval are re-read from the NFT authority here.
        bool executable =
            exists && nft.ownerOf(tokenId) == stored.seller && _isApprovedToTransfer(tokenId, stored.seller);
        return ListingViewV1({seller: stored.seller, price: stored.price, exists: exists, executable: executable});
    }

    function buy(uint256 tokenId) external payable nonReentrant {
        ListingV1 memory listing = _listings[tokenId];
        if (listing.seller == address(0)) revert ListingNotFound(tokenId);
        if (msg.sender == listing.seller) revert BuyerIsSeller(msg.sender);
        if (msg.value != listing.price) {
            revert IncorrectPayment(listing.price, msg.value);
        }
        if (nft.ownerOf(tokenId) != listing.seller) revert ListingStale(tokenId);
        if (!_isApprovedToTransfer(tokenId, listing.seller)) revert ListingStale(tokenId);

        // CEI: remove the listing before any external call so a reentrant buy
        // sees ListingNotFound, and rely on rollback if settlement fails.
        delete _listings[tokenId];

        // Canonical settlement order: native seller payment, then NFT transfer.
        // Any failure here reverts the whole transaction, so no partial
        // settlement and no Purchased event can survive failure.
        (bool paid,) = listing.seller.call{value: listing.price}("");
        if (!paid) revert PaymentFailed(listing.seller, listing.price);

        nft.safeTransferFrom(listing.seller, msg.sender, tokenId);

        emit Purchased(tokenId, listing.seller, msg.sender, listing.price);
    }

    /// @dev Live NFT transfer authority: token approval or operator approval.
    function _isApprovedToTransfer(uint256 tokenId, address owner) private view returns (bool) {
        return nft.getApproved(tokenId) == address(this) || nft.isApprovedForAll(owner, address(this));
    }
}
