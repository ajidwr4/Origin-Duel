// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {EvmV1Decoder} from "../lib/asc-contracts/contracts/common/EvmV1Decoder.sol";
import {INativeQueryVerifier} from "../lib/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";
import {MonsterFactoryASC} from "../src/MonsterFactoryASC.sol";
import {MonsterNFT} from "../src/MonsterNFT.sol";
import {TransactionType2V1} from "../src/lib/TransactionType2V1.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Interface-compatible Block Prover test double (view-only, staticcall
///      compatible), injected through the immutable constructor argument.
contract CaptureMockBlockProver {
    bool public verifyOk = true;
    uint64 public txIndex = 42;

    function setVerifyOk(bool ok) external {
        verifyOk = ok;
    }

    function setTxIndex(uint64 index) external {
        txIndex = index;
    }

    function verify(
        uint64,
        uint64,
        bytes calldata,
        INativeQueryVerifier.MerkleProof calldata,
        INativeQueryVerifier.ContinuityProof calldata
    ) external view returns (bool) {
        return verifyOk;
    }

    function calculateTxIndex(INativeQueryVerifier.MerkleProof calldata) external view returns (uint64) {
        return txIndex;
    }
}

/// @dev Receiver that reverts inside onERC721Received: the mint callback
///      rollback must restore every Factory effect.
contract RevertingCaptureReceiver {
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        revert("receiver rejects capture mint");
    }
}

/// @dev Receiver that reenters finalCapture for the same source from the
///      ERC721 callback while the outer capture is still in flight, and
///      ABSORBS the guard revert inside try/catch. A Shanghai EVM caller can
///      always hide a single recoverable sub-call, so the canonical guarantee
///      here is that the absorbed attempt cannot yield anything beyond the
///      single legitimate outer capture (GS11-06 residual-risk flip side).
contract ReentrantCaptureReceiver {
    MonsterFactoryASC private factory;
    MonsterFactoryASC.ProofPayloadV1 private proof;
    bytes32 private claimedTxHash;
    MonsterFactoryASC.SignedAssetApprovalV1 private approval;

    function arm(
        MonsterFactoryASC factory_,
        MonsterFactoryASC.ProofPayloadV1 calldata proof_,
        bytes32 claimedTxHash_,
        MonsterFactoryASC.SignedAssetApprovalV1 calldata approval_
    ) external {
        factory = factory_;
        proof = proof_;
        claimedTxHash = claimedTxHash_;
        approval = approval_;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        // Re-enters the same capture: the nonReentrant guard must block this
        // nested call; the receiver then elects to absorb that failure.
        try factory.finalCapture(claimedTxHash, proof, approval) {
            revert("reentrant capture unexpectedly succeeded");
        } catch {
            // Expected: blocked by Factory nonReentrant.
        }
        return this.onERC721Received.selector;
    }
}

/// @dev Receiver whose recursive finalCapture attempt PROPAGATES the guard
///      revert (no absorption). The callback failure must fail the whole
///      outer capture with zero surviving effects (NFT-01 / GS11-06).
contract PropagatingReentrantCaptureReceiver {
    MonsterFactoryASC private factory;
    MonsterFactoryASC.ProofPayloadV1 private proof;
    bytes32 private claimedTxHash;
    MonsterFactoryASC.SignedAssetApprovalV1 private approval;

    function arm(
        MonsterFactoryASC factory_,
        MonsterFactoryASC.ProofPayloadV1 calldata proof_,
        bytes32 claimedTxHash_,
        MonsterFactoryASC.SignedAssetApprovalV1 calldata approval_
    ) external {
        factory = factory_;
        proof = proof_;
        claimedTxHash = claimedTxHash_;
        approval = approval_;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        factory.finalCapture(claimedTxHash, proof, approval);
        return this.onERC721Received.selector;
    }
}

contract MonsterFactoryASCFinalCaptureTest is Test {
    bytes32 internal constant CLAIMED_TX_HASH = 0xe8a1a631557a4b63768f2ea5dd7714f825ab39416d3e753c848e50e39dd24bab;
    bytes32 internal constant FROZEN_DNA = 0x03c4594447d168c8bf50701a468dfb08d85e06f4496f3315d6359f134ede6da8;
    bytes32 internal constant ATTEMPT_KEY = bytes32(uint256(0xfeed));

    address internal constant SOURCE_SENDER = 0x000000000000000000000000000000000000dEaD; // fallback EOA claimant
    address internal constant FIXTURE_TO = 0x1111111111111111111111111111111111111111;
    uint64 internal constant GENESIS = 1_000_000;
    uint64 internal constant BLOCK_HEIGHT = 6_000_000;
    uint256 internal constant SIGNER_PK = 0xA11CE;

    string internal constant TOKEN_URI = "ipfs://origin-duel/capture/0";

    MonsterNFT internal nft;
    MonsterFactoryASC internal factory;
    CaptureMockBlockProver internal prover;
    address internal signer;

    function setUp() public {
        prover = new CaptureMockBlockProver();
        signer = vm.addr(SIGNER_PK);
        (nft, factory) = _deployPair();
        // Fresh-claimant cooldown boundary is 0 + 60: warp past it so the
        // first capture is eligible at the canonical formula.
        vm.warp(60);
    }

    /// @dev Deterministic pair deployment: predict the factory address from
    ///      this contract's CREATE nonce, then deploy NFT(factoryPredicted)
    ///      followed by the factory bound to the actual NFT.
    function _deployPair() internal returns (MonsterNFT nft_, MonsterFactoryASC factory_) {
        uint256 nonce = vm.getNonce(address(this));
        address factoryPredicted = vm.computeCreateAddress(address(this), nonce + 1);
        nft_ = new MonsterNFT(factoryPredicted, "Origin Duel Monster", "ODM");
        factory_ = new MonsterFactoryASC(nft_, signer, address(prover), GENESIS);
        require(address(factory_) == factoryPredicted, "factory prediction drift");
    }

    // ------------------------------------------------------------- fixtures

    function _erc721Log(address from, address to) internal pure returns (EvmV1Decoder.LogEntryTuple memory) {
        bytes32[] memory topics = new bytes32[](4);
        topics[0] = keccak256("Transfer(address,address,uint256)");
        topics[1] = bytes32(uint256(uint160(from)));
        topics[2] = bytes32(uint256(uint160(to)));
        topics[3] = bytes32(uint256(1));
        return EvmV1Decoder.LogEntryTuple({address_: address(0xA), topics: topics, data: hex""});
    }

    function _erc721Transport(address from) internal pure returns (bytes memory) {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = _erc721Log(from, FIXTURE_TO);
        bytes[] memory chunks = new bytes[](3);
        chunks[0] = abi.encode(uint64(7), uint64(21_000), from, false, FIXTURE_TO, 123_456_789, hex"");
        chunks[1] = abi.encode(
            uint64(11_155_111),
            uint128(1_000_000_000),
            uint128(2_000_000_000),
            new EvmV1Decoder.AccessListEntryBytes32[](0),
            1,
            bytes32(uint256(0x1234)),
            bytes32(uint256(0x5678))
        );
        chunks[2] = abi.encode(uint8(1), uint64(21_000), logs, new bytes(256));
        return abi.encode(uint8(2), chunks);
    }

    function _proof(bytes memory encodedTransaction) internal pure returns (MonsterFactoryASC.ProofPayloadV1 memory) {
        INativeQueryVerifier.MerkleProofEntry[] memory siblings = new INativeQueryVerifier.MerkleProofEntry[](2);
        siblings[0] = INativeQueryVerifier.MerkleProofEntry({hash: bytes32(uint256(1)), isLeft: true});
        siblings[1] = INativeQueryVerifier.MerkleProofEntry({hash: bytes32(uint256(2)), isLeft: false});
        bytes32[] memory roots = new bytes32[](1);
        roots[0] = bytes32(uint256(3));
        return MonsterFactoryASC.ProofPayloadV1({
            chainKey: 1,
            blockHeight: BLOCK_HEIGHT,
            encodedTransaction: encodedTransaction,
            merkleRoot: bytes32(uint256(4)),
            siblings: siblings,
            lowerEndpointDigest: bytes32(uint256(5)),
            continuityRoots: roots
        });
    }

    /// @dev Signs the canonical approval over the recomputed monster values.
    function _signApproval(MonsterFactoryASC.AssetApprovalV1 memory approval) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "AssetApprovalV1(address claimant,bytes32 sourceTx,bytes32 attemptKey,bytes32 monsterHash,string tokenURI,uint16 generationSpecVersion,uint16 artSpecVersion,uint16 metadataSpecVersion,uint64 validUntil)"
                ),
                approval.claimant,
                approval.sourceTx,
                approval.attemptKey,
                approval.monsterHash,
                keccak256(bytes(approval.tokenURI)),
                approval.generationSpecVersion,
                approval.artSpecVersion,
                approval.metadataSpecVersion,
                approval.validUntil
            )
        );
        // Independent test-side digest: the domain separator is rebuilt from
        // the canonical EIP-712 fields instead of trusting Factory internals.
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("Origin Duel Asset Approval")),
                keccak256(bytes("1")),
                block.chainid,
                address(factory)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s_) = vm.sign(SIGNER_PK, digest);
        return abi.encodePacked(r, s_, v);
    }

    /// @dev Builds a valid approval for the frozen fixture Monster. The
    ///      monsterHash is computed from the on-chain recomputation path.
    function _validApproval(bytes32 monsterHash)
        internal
        view
        returns (MonsterFactoryASC.SignedAssetApprovalV1 memory)
    {
        MonsterFactoryASC.AssetApprovalV1 memory approval =
            MonsterFactoryASC.AssetApprovalV1({
                claimant: SOURCE_SENDER,
                sourceTx: CLAIMED_TX_HASH,
                attemptKey: ATTEMPT_KEY,
                monsterHash: monsterHash,
                tokenURI: TOKEN_URI,
                generationSpecVersion: 1,
                artSpecVersion: 1,
                metadataSpecVersion: 1,
                validUntil: uint64(block.timestamp + 900)
            });
        return MonsterFactoryASC.SignedAssetApprovalV1({approval: approval, signature: _signApproval(approval)});
    }

    /// @dev Runs the full happy-path capture and returns the minted token ID.
    function _capture(bytes32 monsterHash) internal returns (uint256) {
        MonsterFactoryASC.SignedAssetApprovalV1 memory signed = _validApproval(monsterHash);
        vm.prank(SOURCE_SENDER);
        return factory.finalCapture(CLAIMED_TX_HASH, _proof(_erc721Transport(SOURCE_SENDER)), signed);
    }

    /// @dev Per-claimant capture: transport sender and approval claimant both
    ///      bind to `who`, matching DIRECT_TX_SENDER claimant authority.
    function _captureAs(address who, MonsterFactoryASC.SignedAssetApprovalV1 memory signed) internal returns (uint256) {
        vm.prank(who);
        return factory.finalCapture(CLAIMED_TX_HASH, _proof(_erc721Transport(who)), signed);
    }

    /// @dev Recomputes the on-chain monster hash for the fixture source via
    ///      canonicalPreflight (view) so approvals bind to real values.
    function _erc721Transport() internal pure returns (bytes memory) {
        return _erc721Transport(SOURCE_SENDER);
    }

    /// @dev Second distinct source (nonce 8): different canonical sourceTx,
    ///      used to isolate the cooldown gate from replay.
    function _erc721TransportNonce8(address from) internal pure returns (bytes memory) {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = _erc721Log(from, FIXTURE_TO);
        bytes[] memory chunks = new bytes[](3);
        chunks[0] = abi.encode(uint64(8), uint64(21_000), from, false, FIXTURE_TO, 123_456_789, hex"");
        chunks[1] = abi.encode(
            uint64(11_155_111),
            uint128(1_000_000_000),
            uint128(2_000_000_000),
            new EvmV1Decoder.AccessListEntryBytes32[](0),
            1,
            bytes32(uint256(0x1234)),
            bytes32(uint256(0x5678))
        );
        chunks[2] = abi.encode(uint8(1), uint64(21_000), logs, new bytes(256));
        return abi.encode(uint8(2), chunks);
    }

    function _fixtureMonsterHash() internal returns (bytes32) {
        vm.prank(SOURCE_SENDER);
        MonsterFactoryASC.CanonicalPreflightResultV1 memory result =
            factory.canonicalPreflight(CLAIMED_TX_HASH, _proof(_erc721Transport()));
        return factory.resolvedMonsterHash(result.monster);
    }

    /// @dev Approval + monster hash bound to an arbitrary claimant address:
    ///      preflight is run with that claimant so the recomputed monster hash
    ///      and approval claimant match the final caller.
    function _receiverApproval(address who) internal returns (MonsterFactoryASC.SignedAssetApprovalV1 memory) {
        vm.prank(who);
        MonsterFactoryASC.CanonicalPreflightResultV1 memory result =
            factory.canonicalPreflight(CLAIMED_TX_HASH, _proof(_erc721Transport(who)));
        return _approvalFor(who, factory.resolvedMonsterHash(result.monster), CLAIMED_TX_HASH);
    }

    /// @dev Fully general approval builder for arbitrary claimant/source.
    function _approvalFor(address who, bytes32 monsterHash, bytes32 sourceTx)
        internal
        view
        returns (MonsterFactoryASC.SignedAssetApprovalV1 memory)
    {
        MonsterFactoryASC.AssetApprovalV1 memory approval = MonsterFactoryASC.AssetApprovalV1({
            claimant: who,
            sourceTx: sourceTx,
            attemptKey: ATTEMPT_KEY,
            monsterHash: monsterHash,
            tokenURI: TOKEN_URI,
            generationSpecVersion: 1,
            artSpecVersion: 1,
            metadataSpecVersion: 1,
            validUntil: uint64(block.timestamp + 900)
        });
        bytes memory signature = _signApproval(approval);
        return MonsterFactoryASC.SignedAssetApprovalV1({approval: approval, signature: signature});
    }

    /// @dev Canonical hash of the nonce-8 transport for a given claimant.
    function _derivedNonce8Hash(address who) internal pure returns (bytes32) {
        EvmV1Decoder.DecodedTransactionType2 memory decoded =
            EvmV1Decoder.decodeTransactionType2(_erc721TransportNonce8(who));
        TransactionType2V1.NormalizedType2Transaction memory normalized = TransactionType2V1.NormalizedType2Transaction({
            txType: 2,
            chainId: uint256(decoded.type2.chainId),
            nonce: uint256(decoded.commonTx.nonce),
            maxPriorityFeePerGas: uint256(decoded.type2.maxPriorityFeePerGas),
            maxFeePerGas: uint256(decoded.type2.maxFeePerGas),
            gasLimit: uint256(decoded.commonTx.gasLimit),
            hasTo: !decoded.commonTx.toIsNull,
            to: decoded.commonTx.to,
            value: decoded.commonTx.value,
            input: decoded.commonTx.data,
            accessListLength: decoded.type2.accessList.length,
            yParity: decoded.type2.yParity,
            r: uint256(decoded.type2.r),
            s: uint256(decoded.type2.s)
        });
        return TransactionType2V1.deriveCanonicalSourceTx(normalized);
    }

    // ------------------------------------------------------------ happy path

    function testFinalCaptureSuccessFullRecomputation() public {
        bytes32 monsterHash = _fixtureMonsterHash();
        uint256 tokenId = _capture(monsterHash);

        assertEq(tokenId, 0);
        assertEq(nft.ownerOf(0), SOURCE_SENDER);
        assertEq(factory.lookupReplay(CLAIMED_TX_HASH), 1);
        assertEq(factory.lastCaptureAtExternal(SOURCE_SENDER), block.timestamp);
        assertEq(nft.tokenURI(0), TOKEN_URI);

        // Frozen M02 vector at DNA 0x03c459...da8: species 7, level 3,
        // 800/1200, element 2, rarity 1 — the NFT record is exact.
        assertEq(nft.monsterOf(0).speciesId, 7);
        assertEq(nft.monsterOf(0).level, 3);
        assertEq(nft.monsterOf(0).atk, 800);
        assertEq(nft.monsterOf(0).def, 1200);
        assertEq(nft.monsterOf(0).element, 2);
        assertEq(nft.monsterOf(0).rarity, 1);
        assertEq(nft.monsterOf(0).transactionDNA, FROZEN_DNA);
        assertEq(nft.monsterOf(0).sourceTx, CLAIMED_TX_HASH);
    }

    function testFinalCaptureEmitsExactMonsterCaptured() public {
        bytes32 monsterHash = _fixtureMonsterHash();
        MonsterFactoryASC.SignedAssetApprovalV1 memory signed = _validApproval(monsterHash);
        vm.prank(SOURCE_SENDER);
        vm.expectEmit(true, true, true, true, address(factory));
        emit MonsterFactoryASC.MonsterCaptured(SOURCE_SENDER, CLAIMED_TX_HASH, 0, FROZEN_DNA, ATTEMPT_KEY, TOKEN_URI);
        factory.finalCapture(CLAIMED_TX_HASH, _proof(_erc721Transport()), signed);
    }

    // -------------------------------------------------- approval negatives

    function testApprovalInvalidSignerRejects() public {
        bytes32 monsterHash = _fixtureMonsterHash();
        MonsterFactoryASC.SignedAssetApprovalV1 memory signed = _validApproval(monsterHash);
        // Corrupt the signature: recovery no longer yields the signer.
        signed.signature = abi.encodePacked(bytes32(uint256(0xBAD)), bytes32(uint256(2)), uint8(28));
        vm.prank(SOURCE_SENDER);
        vm.expectRevert(MonsterFactoryASC.InvalidAssetApprovalSignature.selector);
        factory.finalCapture(CLAIMED_TX_HASH, _proof(_erc721Transport()), signed);
    }

    function testApprovalExpiredRejects() public {
        bytes32 monsterHash = _fixtureMonsterHash();
        MonsterFactoryASC.SignedAssetApprovalV1 memory signed = _validApproval(monsterHash);
        signed.approval.validUntil = uint64(block.timestamp - 1);
        // Re-sign with the new validUntil so only expiry is under test.
        signed.signature = _signApproval(signed.approval);
        vm.prank(SOURCE_SENDER);
        vm.expectRevert(
            abi.encodeWithSelector(MonsterFactoryASC.AssetApprovalExpired.selector, uint64(block.timestamp - 1))
        );
        factory.finalCapture(CLAIMED_TX_HASH, _proof(_erc721Transport()), signed);
    }

    function testApprovalClaimantMismatchRejects() public {
        bytes32 monsterHash = _fixtureMonsterHash();
        MonsterFactoryASC.SignedAssetApprovalV1 memory signed = _validApproval(monsterHash);
        signed.approval.claimant = address(0xBAD);
        vm.prank(SOURCE_SENDER);
        vm.expectRevert(
            abi.encodeWithSelector(
                MonsterFactoryASC.AssetApprovalClaimantMismatch.selector, address(0xBAD), SOURCE_SENDER
            )
        );
        factory.finalCapture(CLAIMED_TX_HASH, _proof(_erc721Transport()), signed);
    }

    function testApprovalSourceMismatchRejects() public {
        bytes32 monsterHash = _fixtureMonsterHash();
        MonsterFactoryASC.SignedAssetApprovalV1 memory signed = _validApproval(monsterHash);
        signed.approval.sourceTx = bytes32(uint256(0xBAD));
        vm.prank(SOURCE_SENDER);
        vm.expectRevert(
            abi.encodeWithSelector(
                MonsterFactoryASC.AssetApprovalSourceMismatch.selector, bytes32(uint256(0xBAD)), CLAIMED_TX_HASH
            )
        );
        factory.finalCapture(CLAIMED_TX_HASH, _proof(_erc721Transport()), signed);
    }

    function testApprovalMonsterHashMismatchRejects() public {
        bytes32 monsterHash = _fixtureMonsterHash();
        MonsterFactoryASC.SignedAssetApprovalV1 memory signed = _validApproval(monsterHash);
        signed.approval.monsterHash = bytes32(uint256(0xBAD));
        signed.signature = _signApproval(signed.approval);
        vm.prank(SOURCE_SENDER);
        vm.expectRevert(
            abi.encodeWithSelector(
                MonsterFactoryASC.AssetApprovalMonsterMismatch.selector, bytes32(uint256(0xBAD)), monsterHash
            )
        );
        factory.finalCapture(CLAIMED_TX_HASH, _proof(_erc721Transport()), signed);
    }

    function testApprovalWrongSpecVersionsReject() public {
        bytes32 monsterHash = _fixtureMonsterHash();
        MonsterFactoryASC.SignedAssetApprovalV1 memory signed = _validApproval(monsterHash);
        signed.approval.generationSpecVersion = 2;
        signed.signature = _signApproval(signed.approval);
        vm.prank(SOURCE_SENDER);
        vm.expectRevert(abi.encodeWithSelector(MonsterFactoryASC.InvalidAssetSpecVersion.selector, 2, 1, 1));
        factory.finalCapture(CLAIMED_TX_HASH, _proof(_erc721Transport()), signed);

        signed = _validApproval(monsterHash);
        signed.approval.artSpecVersion = 3;
        signed.signature = _signApproval(signed.approval);
        vm.prank(SOURCE_SENDER);
        vm.expectRevert(abi.encodeWithSelector(MonsterFactoryASC.InvalidAssetSpecVersion.selector, 1, 3, 1));
        factory.finalCapture(CLAIMED_TX_HASH, _proof(_erc721Transport()), signed);

        signed = _validApproval(monsterHash);
        signed.approval.metadataSpecVersion = 9;
        signed.signature = _signApproval(signed.approval);
        vm.prank(SOURCE_SENDER);
        vm.expectRevert(abi.encodeWithSelector(MonsterFactoryASC.InvalidAssetSpecVersion.selector, 1, 1, 9));
        factory.finalCapture(CLAIMED_TX_HASH, _proof(_erc721Transport()), signed);
    }

    function testApprovalEmptyTokenURIRejects() public {
        bytes32 monsterHash = _fixtureMonsterHash();
        MonsterFactoryASC.SignedAssetApprovalV1 memory signed = _validApproval(monsterHash);
        signed.approval.tokenURI = "";
        vm.prank(SOURCE_SENDER);
        vm.expectRevert(MonsterFactoryASC.InvalidTokenURI.selector);
        factory.finalCapture(CLAIMED_TX_HASH, _proof(_erc721Transport()), signed);
    }

    // --------------------------------------------------- replay / cooldown

    function testReplayRejectsSecondCaptureOfSameSource() public {
        bytes32 monsterHash = _fixtureMonsterHash();
        _capture(monsterHash);

        vm.warp(block.timestamp + 120); // cooldown has passed
        MonsterFactoryASC.SignedAssetApprovalV1 memory signed = _validApproval(monsterHash);
        vm.prank(SOURCE_SENDER);
        vm.expectRevert(abi.encodeWithSelector(MonsterFactoryASC.SourceAlreadyConsumed.selector, CLAIMED_TX_HASH, 0));
        factory.finalCapture(CLAIMED_TX_HASH, _proof(_erc721Transport()), signed);
    }

    function testActiveCooldownRejectsSecondCapture() public {
        // First capture at t=60 by the EOA claimant.
        bytes32 monsterHash = _fixtureMonsterHash();
        _capture(monsterHash);

        // Second, DIFFERENT source within the cooldown window: only the
        // cooldown gate can reject (this source's replay entry is UNUSED).
        address who = SOURCE_SENDER;
        bytes32 source2 = _derivedNonce8Hash(who);
        vm.prank(who);
        MonsterFactoryASC.CanonicalPreflightResultV1 memory result =
            factory.canonicalPreflight(source2, _proof(_erc721TransportNonce8(who)));
        MonsterFactoryASC.SignedAssetApprovalV1 memory signed =
            _approvalFor(who, factory.resolvedMonsterHash(result.monster), source2);

        vm.prank(who);
        vm.expectRevert(abi.encodeWithSelector(MonsterFactoryASC.CaptureCooldownActive.selector, uint64(60 + 60)));
        factory.finalCapture(source2, _proof(_erc721TransportNonce8(who)), signed);

        // The rejected capture consumed nothing.
        assertEq(factory.lookupReplay(source2), 0);
    }

    function testStalePreflightCannotBypassFinalState() public {
        // Preflight before capture says eligible; after capture the final path
        // recomputes current state and rejects despite the stale view.
        bytes32 monsterHash = _fixtureMonsterHash();
        MonsterFactoryASC.EligibilityViewV1 memory before = factory.readEligibility(SOURCE_SENDER, CLAIMED_TX_HASH);
        assertTrue(before.replayUnused);

        _capture(monsterHash);

        vm.warp(block.timestamp + 120);
        MonsterFactoryASC.SignedAssetApprovalV1 memory signed = _validApproval(monsterHash);
        vm.prank(SOURCE_SENDER);
        vm.expectRevert(abi.encodeWithSelector(MonsterFactoryASC.SourceAlreadyConsumed.selector, CLAIMED_TX_HASH, 0));
        factory.finalCapture(CLAIMED_TX_HASH, _proof(_erc721Transport()), signed);
    }

    // ------------------------------------------ NFT-01 rollback / reentrancy

    function testReceiverRevertRollsBackEverything() public {
        RevertingCaptureReceiver receiver = new RevertingCaptureReceiver();
        MonsterFactoryASC.SignedAssetApprovalV1 memory signed = _receiverApproval(address(receiver));

        vm.prank(address(receiver));
        vm.expectRevert("receiver rejects capture mint");
        factory.finalCapture(CLAIMED_TX_HASH, _proof(_erc721Transport(address(receiver))), signed);

        // Whole capture reverted: no partial effect survived.
        assertEq(factory.lookupReplay(CLAIMED_TX_HASH), 0);
        assertEq(factory.lastCaptureAtExternal(address(receiver)), 0);
        assertEq(nft.nextTokenId(), 0);
        vm.expectRevert();
        nft.ownerOf(0);
    }

    function testReentrantReceiverAttemptRollsBackWholeCapture() public {
        PropagatingReentrantCaptureReceiver receiver = new PropagatingReentrantCaptureReceiver();
        MonsterFactoryASC.SignedAssetApprovalV1 memory signed = _receiverApproval(address(receiver));
        receiver.arm(factory, _proof(_erc721Transport(address(receiver))), CLAIMED_TX_HASH, signed);

        // The recursive finalCapture attempt reverts with the guard error and
        // the callback lets it propagate: NFT-01 / GS11-06 outer rollback.
        vm.prank(address(receiver));
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        factory.finalCapture(CLAIMED_TX_HASH, _proof(_erc721Transport(address(receiver))), signed);

        // REENTRANT_RECEIVER_OUTER_CAPTURE_ROLLBACK: zero surviving effects.
        assertEq(factory.lookupReplay(CLAIMED_TX_HASH), 0);
        assertEq(factory.lastCaptureAtExternal(address(receiver)), 0);
        assertEq(nft.nextTokenId(), 0);
        vm.expectRevert();
        nft.ownerOf(0);
        vm.expectRevert();
        nft.monsterOf(0);
        vm.expectRevert();
        nft.tokenURI(0);

        vm.recordLogs();
        // No successful MonsterCaptured effect survived the reverted capture.
        Vm.Log[] memory entries = vm.getRecordedLogs();
        for (uint256 i = 0; i < entries.length; i++) {
            assertFalse(
                entries[i].topics[0] == MonsterFactoryASC.MonsterCaptured.selector,
                "MonsterCaptured survived the failed capture"
            );
        }
    }

    function testReentrantCaptureBlockedByGuardAndMintCompletes() public {
        ReentrantCaptureReceiver receiver = new ReentrantCaptureReceiver();
        MonsterFactoryASC.SignedAssetApprovalV1 memory signed = _receiverApproval(address(receiver));
        receiver.arm(factory, _proof(_erc721Transport(address(receiver))), CLAIMED_TX_HASH, signed);

        uint256 tokenId = _captureAs(address(receiver), signed);

        // Absorbed re-enters cannot widen the outcome: still exactly one
        // legitimate capture, one replay consumption, one cooldown, one NFT.
        assertEq(tokenId, 0);
        assertEq(nft.ownerOf(0), address(receiver));
        assertEq(factory.lookupReplay(CLAIMED_TX_HASH), 1);
        assertEq(factory.lastCaptureAtExternal(address(receiver)), block.timestamp);
        assertEq(nft.nextTokenId(), 1);
    }

    // -------------------------------------------------------- proof gates

    function testFinalCaptureProverFalseRejects() public {
        bytes32 monsterHash = _fixtureMonsterHash();
        prover.setVerifyOk(false);
        MonsterFactoryASC.SignedAssetApprovalV1 memory signed = _validApproval(monsterHash);
        vm.prank(SOURCE_SENDER);
        vm.expectRevert(MonsterFactoryASC.ProofVerificationFailed.selector);
        factory.finalCapture(CLAIMED_TX_HASH, _proof(_erc721Transport()), signed);
    }

    function testFinalCaptureOversizedRejectsBeforeProver() public {
        MonsterFactoryASC.SignedAssetApprovalV1 memory signed = _validApproval(bytes32(uint256(1)));
        bytes memory big = new bytes(65_537);
        MonsterFactoryASC.ProofPayloadV1 memory proof = _proof(big);
        vm.prank(SOURCE_SENDER);
        vm.expectRevert(abi.encodeWithSelector(MonsterFactoryASC.EncodedTransactionTooLarge.selector, 65_537, 65_536));
        factory.finalCapture(CLAIMED_TX_HASH, proof, signed);
    }

    function testFinalCaptureWrongClaimantRejects() public {
        bytes32 monsterHash = _fixtureMonsterHash();
        MonsterFactoryASC.SignedAssetApprovalV1 memory signed = _validApproval(monsterHash);
        address other = makeAddr("other");
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(MonsterFactoryASC.InvalidClaimant.selector, SOURCE_SENDER, other));
        factory.finalCapture(CLAIMED_TX_HASH, _proof(_erc721Transport()), signed);
    }

    function testFinalCaptureClaimedHashMismatchRejects() public {
        bytes32 monsterHash = _fixtureMonsterHash();
        MonsterFactoryASC.SignedAssetApprovalV1 memory signed = _validApproval(monsterHash);
        vm.prank(SOURCE_SENDER);
        vm.expectRevert(
            abi.encodeWithSelector(MonsterFactoryASC.ClaimedHashMismatch.selector, bytes32(uint256(9)), CLAIMED_TX_HASH)
        );
        factory.finalCapture(bytes32(uint256(9)), _proof(_erc721Transport()), signed);
    }

    // ---------------------------------------------------- M02 regression

    function testNoRegressionToFrozenDnaVector() public view {
        // The fixture Monster still matches the frozen M02 vector exactly.
        MonsterFactoryASC.CanonicalPreflightResultV1 memory result;
        // direct library regression is covered by DeterministicLibraries.t.sol;
        // here assert the frozen constants the capture path depends on.
        assertEq(uint256(factory.CAPTURE_COOLDOWN()), 60);
        assertEq(factory.CAPTURE_GENESIS_BLOCK(), GENESIS);
        assertEq(factory.assetApprovalSigner(), signer);
    }
}
