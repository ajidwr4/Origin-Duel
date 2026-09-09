// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {MonsterTypesV1} from "../src/lib/MonsterTypesV1.sol";
import {MonsterNFT} from "../src/MonsterNFT.sol";

contract RevertingReceiver {
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        revert("receiver rejects mint");
    }
}

contract MonsterNFTTest is Test {
    MonsterNFT private nft;
    address private factory = makeAddr("factory");
    address private claimant = makeAddr("claimant");

    function setUp() public {
        nft = new MonsterNFT(factory, "Origin Duel Monster", "ODM");
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

    function testInitialNextTokenIdIsZero() public view {
        assertEq(nft.nextTokenId(), 0);
    }

    function testNonFactoryMintRevertsOnlyFactory() public {
        vm.prank(claimant);
        vm.expectRevert(MonsterNFT.OnlyFactory.selector);
        nft.mintFromFactory(0, claimant, _monster(), "ipfs://token/0");
    }

    function testZeroRecipientRevertsInvalidMintRecipient() public {
        vm.prank(factory);
        vm.expectRevert(MonsterNFT.InvalidMintRecipient.selector);
        nft.mintFromFactory(0, address(0), _monster(), "ipfs://token/0");
    }

    function testZeroSourceTxRevertsInvalidMonsterSourceTx() public {
        MonsterTypesV1.ResolvedMonsterV1 memory monster = _monster();
        monster.sourceTx = bytes32(0);
        vm.prank(factory);
        vm.expectRevert(MonsterNFT.InvalidMonsterSourceTx.selector);
        nft.mintFromFactory(0, claimant, monster, "ipfs://token/0");
    }

    function testStaleExpectedTokenIdRevertsUnexpectedTokenId() public {
        vm.prank(factory);
        vm.expectRevert(abi.encodeWithSelector(MonsterNFT.UnexpectedTokenId.selector, 1, 0));
        nft.mintFromFactory(1, claimant, _monster(), "ipfs://token/1");
    }

    function testFirstMintAllocatesTokenIdZero() public {
        vm.prank(factory);
        uint256 tokenId = nft.mintFromFactory(0, claimant, _monster(), "ipfs://token/0");

        assertEq(tokenId, 0);
        assertEq(nft.nextTokenId(), 1);
        assertEq(nft.ownerOf(0), claimant);
    }

    function testSecondMintAllocatesTokenIdOne() public {
        vm.startPrank(factory);
        nft.mintFromFactory(0, claimant, _monster(), "ipfs://token/0");
        uint256 tokenId = nft.mintFromFactory(1, claimant, _monster(), "ipfs://token/1");
        vm.stopPrank();

        assertEq(tokenId, 1);
        assertEq(nft.nextTokenId(), 2);
        assertEq(nft.ownerOf(1), claimant);
    }

    function testMonotonicHandshakeRejectsUnexpectedTokenIdAfterMint() public {
        vm.startPrank(factory);
        nft.mintFromFactory(0, claimant, _monster(), "ipfs://token/0");
        vm.expectRevert(abi.encodeWithSelector(MonsterNFT.UnexpectedTokenId.selector, 0, 1));
        nft.mintFromFactory(0, claimant, _monster(), "ipfs://token/0");
        vm.stopPrank();
    }

    function testMonsterOfReturnsExactStoredMonster() public {
        vm.prank(factory);
        nft.mintFromFactory(0, claimant, _monster(), "ipfs://token/0");

        MonsterTypesV1.ResolvedMonsterV1 memory stored = nft.monsterOf(0);
        MonsterTypesV1.ResolvedMonsterV1 memory expected = _monster();

        assertEq(stored.speciesId, expected.speciesId);
        assertEq(stored.level, expected.level);
        assertEq(stored.atk, expected.atk);
        assertEq(stored.def, expected.def);
        assertEq(stored.element, expected.element);
        assertEq(stored.rarity, expected.rarity);
        assertEq(stored.transactionDNA, expected.transactionDNA);
        assertEq(stored.sourceTx, expected.sourceTx);
    }

    function testTokenURIReturnsExactStoredValue() public {
        vm.prank(factory);
        nft.mintFromFactory(0, claimant, _monster(), "ipfs://token/0");

        assertEq(nft.tokenURI(0), "ipfs://token/0");
    }

    function testUnownedTokenIdReadsRevert() public {
        vm.expectRevert();
        nft.tokenURI(0);

        vm.expectRevert();
        this.monsterOfExternal(nft, 0);
    }

    function monsterOfExternal(MonsterNFT target, uint256 tokenId) external view {
        target.monsterOf(tokenId);
    }

    function testMintReturnsExactTokenId() public {
        vm.prank(factory);
        assertEq(nft.mintFromFactory(0, claimant, _monster(), "ipfs://token/0"), 0);
    }

    function testNoPostMintMutationSurface() public view {
        // Immutable records: no setter exists on the release ABI; reads of the
        // same token are stable across calls.
        bytes4[] memory forbidden = new bytes4[](4);
        forbidden[0] = bytes4(keccak256("setTokenURI(uint256,string)"));
        forbidden[1] = bytes4(keccak256("setMonster(uint256,(uint16,uint8,uint16,uint16,uint8,uint8,bytes32,bytes32))"));
        forbidden[2] = bytes4(keccak256("setSourceTx(uint256,bytes32)"));
        forbidden[3] = bytes4(keccak256("burn(uint256)"));
        for (uint256 i = 0; i < forbidden.length; i++) {
            assertFalse(nft.supportsInterface(forbidden[i]));
        }
    }

    function testReceiverRevertRollsBackNextTokenIdMonsterUriAndOwnership() public {
        RevertingReceiver receiver = new RevertingReceiver();
        vm.prank(factory);
        vm.expectRevert("receiver rejects mint");
        nft.mintFromFactory(0, address(receiver), _monster(), "ipfs://token/0");

        // Whole mint reverted: counter, ownership, and both records restored.
        assertEq(nft.nextTokenId(), 0);
        vm.expectRevert();
        nft.ownerOf(0);
        vm.expectRevert();
        nft.tokenURI(0);
        vm.expectRevert();
        this.monsterOfExternal(nft, 0);
    }

    function testSafeReceiverMintSucceeds() public {
        vm.prank(factory);
        uint256 tokenId = nft.mintFromFactory(0, claimant, _monster(), "ipfs://token/0");

        assertEq(tokenId, 0);
        assertEq(nft.ownerOf(0), claimant);
    }

    function testApproveOperatorTransferRemainFunctional() public {
        vm.prank(factory);
        nft.mintFromFactory(0, claimant, _monster(), "ipfs://token/0");

        address operator = makeAddr("operator");
        vm.prank(claimant);
        nft.setApprovalForAll(operator, true);
        assertTrue(nft.isApprovedForAll(claimant, operator));

        vm.prank(operator);
        nft.transferFrom(claimant, operator, 0);
        assertEq(nft.ownerOf(0), operator);

        vm.prank(operator);
        nft.approve(claimant, 0);
        assertEq(nft.getApproved(0), claimant);

        vm.prank(claimant);
        nft.safeTransferFrom(operator, claimant, 0);
        assertEq(nft.ownerOf(0), claimant);
    }

    function testNameAndSymbolExposed() public view {
        assertEq(nft.name(), "Origin Duel Monster");
        assertEq(nft.symbol(), "ODM");
    }
}
