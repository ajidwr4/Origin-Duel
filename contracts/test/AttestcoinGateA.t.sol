// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {EvmV1Decoder} from "../lib/asc-contracts/contracts/common/EvmV1Decoder.sol";
import {
    INativeQueryVerifier,
    NativeQueryVerifierLib
} from "../lib/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";
import {TransactionType2V1} from "../src/lib/TransactionType2V1.sol";

/// @title Gate A compatibility probe for the pinned Attestcoin source.
/// @notice Exercises the vendored @gluwa/asc-contracts@0.2.1 verifier interface
///         and decoder as the exact Origin Duel V1 candidate. Transport payloads
///         follow the vendored decoder layout; the expected signed bytes and
///         sourceTx stay source-owned frozen Phase 4/M02 fixtures.
contract AttestcoinGateATest is Test {
    /// @dev Selector of the canonical single-proof verify() ABI from Phase 10.
    bytes4 private constant CANONICAL_VERIFY_SELECTOR =
        bytes4(keccak256("verify(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))"));

    bytes private constant EXPECTED_RAW_TYPE2 =
        hex"02f583aa36a707843b9aca00847735940082520894111111111111111111111111111111111111111184075bcd1580c001821234825678";
    bytes32 private constant EXPECTED_SOURCE_TX = 0xe8a1a631557a4b63768f2ea5dd7714f825ab39416d3e753c848e50e39dd24bab;

    address private constant BLOCK_PROVER = 0x0000000000000000000000000000000000000FD2;
    address private constant FIXTURE_TO = 0x1111111111111111111111111111111111111111;
    // Transport metadata only: an EIP-1559 hash never carries `from`, so any
    // sender value exercises the field without affecting the sourceTx oracle.
    address private constant FIXTURE_FROM = 0x000000000000000000000000000000000000dEaD;
    uint64 private constant SEPOLIA_CHAIN_KEY = 1;
    uint64 private constant FIXTURE_BLOCK_HEIGHT = 6_000_000;

    function testAbiVendoredVerifyMatchesCanonicalCallShape() public {
        INativeQueryVerifier.MerkleProofEntry[] memory siblings = new INativeQueryVerifier.MerkleProofEntry[](2);
        siblings[0] = INativeQueryVerifier.MerkleProofEntry({hash: bytes32(uint256(2)), isLeft: false});
        siblings[1] = INativeQueryVerifier.MerkleProofEntry({hash: bytes32(uint256(3)), isLeft: true});
        INativeQueryVerifier.MerkleProof memory merkleProof =
            INativeQueryVerifier.MerkleProof({root: bytes32(uint256(1)), siblings: siblings});
        bytes32[] memory roots = new bytes32[](1);
        roots[0] = bytes32(uint256(5));
        INativeQueryVerifier.ContinuityProof memory continuityProof =
            INativeQueryVerifier.ContinuityProof({lowerEndpointDigest: bytes32(uint256(4)), roots: roots});

        // The vendored interface overloads verify(); concrete-typed arguments in
        // the probe helper resolve the single-proof overload, so the call the
        // Block Prover receives is exactly the canonical Phase 10 ABI. The
        // expected calldata below is the canonical encoding built from the
        // canonical signature string, not from the vendored source.
        bytes memory expectedCanonicalCall = abi.encodeWithSignature(
            "verify(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))",
            SEPOLIA_CHAIN_KEY,
            FIXTURE_BLOCK_HEIGHT,
            _mainFixtureTransport(),
            merkleProof,
            continuityProof
        );
        assertEq(bytes4(expectedCanonicalCall), CANONICAL_VERIFY_SELECTOR);

        // The local test chain has no 0xFD2 precompile; mock its return so the
        // call completes while expectCall still asserts the exact calldata the
        // vendored interface emitted toward the canonical Block Prover address.
        vm.mockCall(BLOCK_PROVER, expectedCanonicalCall, abi.encode(true));
        vm.expectCall(BLOCK_PROVER, expectedCanonicalCall);
        bool verified = new VerifyCallProbe()
            .prove(
                BLOCK_PROVER,
                SEPOLIA_CHAIN_KEY,
                FIXTURE_BLOCK_HEIGHT,
                _mainFixtureTransport(),
                merkleProof,
                continuityProof
            );
        assertTrue(verified);
    }

    function testAbiVendoredPinsCanonicalBlockProverPrecompile() public pure {
        // The vendored helper library hard-codes the canonical Block Prover
        // precompile; the application adds no verifier address configuration.
        assertEq(NativeQueryVerifierLib.PRECOMPILE, BLOCK_PROVER);
        assertEq(address(NativeQueryVerifierLib.getVerifier()), BLOCK_PROVER);
    }

    function testDecoderType2ProfileFieldsExact() public pure {
        EvmV1Decoder.DecodedTransactionType2 memory decoded =
            EvmV1Decoder.decodeTransactionType2(_mainFixtureTransport());

        assertEq(uint256(decoded.commonTx.nonce), 7);
        assertEq(uint256(decoded.commonTx.gasLimit), 21_000);
        assertEq(decoded.commonTx.from, FIXTURE_FROM);
        assertFalse(decoded.commonTx.toIsNull);
        assertEq(decoded.commonTx.to, FIXTURE_TO);
        assertEq(decoded.commonTx.value, 123_456_789);
        assertEq(decoded.commonTx.data, hex"");
        assertEq(uint256(decoded.type2.chainId), 11_155_111);
        assertEq(uint256(decoded.type2.maxPriorityFeePerGas), 1_000_000_000);
        assertEq(uint256(decoded.type2.maxFeePerGas), 2_000_000_000);
        assertEq(decoded.type2.accessList.length, 0);
        assertEq(uint256(decoded.type2.yParity), 1);
        assertEq(uint256(decoded.type2.r), 0x1234);
        assertEq(uint256(decoded.type2.s), 0x5678);
        // Receipt exposure is required: the application must check status 0x1.
        assertEq(uint256(decoded.receipt.receiptStatus), 1);
        assertEq(decoded.receipt.receiptLogs.length, 0);
    }

    function testDecoderRejectsNonType2Transport() public {
        (, bytes[] memory chunks) = abi.decode(_mainFixtureTransport(), (uint8, bytes[]));
        bytes memory wrongType = abi.encode(uint8(0), chunks);
        vm.expectRevert("EvmV1Decoder: Expected type 2");
        this.decodeType2External(wrongType);
    }

    function testFixtureDecodedMappingReproducesFrozenRawBytesAndSourceTx() public pure {
        EvmV1Decoder.DecodedTransactionType2 memory decoded =
            EvmV1Decoder.decodeTransactionType2(_mainFixtureTransport());
        TransactionType2V1.NormalizedType2Transaction memory normalized = _normalizedFromDecoded(decoded);

        assertEq(TransactionType2V1.reconstructSigned(normalized), EXPECTED_RAW_TYPE2);
        assertEq(TransactionType2V1.deriveCanonicalSourceTx(normalized), EXPECTED_SOURCE_TX);
        assertEq(TransactionType2V1.bindCanonicalSourceTx(normalized, EXPECTED_SOURCE_TX), EXPECTED_SOURCE_TX);
    }

    function testFixtureCreationEdgeReconstructsFrozenBytes() public pure {
        EvmV1Decoder.DecodedTransactionType2 memory decoded =
            EvmV1Decoder.decodeTransactionType2(_creationEdgeTransport());
        TransactionType2V1.NormalizedType2Transaction memory normalized = _normalizedFromDecoded(decoded);

        assertEq(
            TransactionType2V1.reconstructSigned(normalized),
            hex"02da83aa36a780843b9aca008477359400825208808000c080018180"
        );
    }

    function testGuardRejectsUnsupportedApplicationProfiles() public {
        // Origin Duel acceptance is narrower than what the decoder can decode:
        // the source-owned profile guard still rejects every out-of-profile
        // shape even though the vendored decoder supports wider EVM types.
        TransactionType2V1.NormalizedType2Transaction memory transaction = _m02Fixture();
        transaction.txType = 0;
        vm.expectRevert(abi.encodeWithSelector(TransactionType2V1.UnsupportedTransactionType.selector, uint8(0)));
        this.reconstructExternal(transaction);

        transaction = _m02Fixture();
        transaction.chainId = 1;
        vm.expectRevert(abi.encodeWithSelector(TransactionType2V1.UnsupportedChainId.selector, uint256(1)));
        this.reconstructExternal(transaction);

        transaction = _m02Fixture();
        transaction.accessListLength = 1;
        vm.expectRevert(TransactionType2V1.UnsupportedAccessList.selector);
        this.reconstructExternal(transaction);

        transaction = _m02Fixture();
        transaction.yParity = 2;
        vm.expectRevert(abi.encodeWithSelector(TransactionType2V1.InvalidYParity.selector, uint8(2)));
        this.reconstructExternal(transaction);
    }

    /// @dev External wrapper so expectRevert observes the pure library revert.
    function reconstructExternal(TransactionType2V1.NormalizedType2Transaction memory transaction)
        external
        pure
        returns (bytes memory)
    {
        return TransactionType2V1.reconstructSigned(transaction);
    }

    /// @dev External wrapper so expectRevert observes the decoder require.
    function decodeType2External(bytes memory encoded)
        external
        pure
        returns (EvmV1Decoder.DecodedTransactionType2 memory)
    {
        return EvmV1Decoder.decodeTransactionType2(encoded);
    }

    /// @dev Vendored decoder layout: abi.encode(uint8 type, bytes[] chunks)
    ///      with chunk[0] common fields, chunk[1] Type-2 fields, chunk[2] receipt.
    function _type2Transport(
        uint64 nonce,
        address to,
        bool toIsNull,
        uint256 value,
        bytes memory data,
        uint8 yParity,
        bytes32 r,
        bytes32 s
    ) private pure returns (bytes memory) {
        bytes[] memory chunks = new bytes[](3);
        chunks[0] = abi.encode(nonce, uint64(21_000), FIXTURE_FROM, toIsNull, to, value, data);
        chunks[1] = abi.encode(
            uint64(11_155_111),
            uint128(1_000_000_000),
            uint128(2_000_000_000),
            new EvmV1Decoder.AccessListEntryBytes32[](0),
            yParity,
            r,
            s
        );
        chunks[2] = abi.encode(uint8(1), uint64(21_000), new EvmV1Decoder.LogEntryTuple[](0), new bytes(256));
        return abi.encode(uint8(2), chunks);
    }

    function _mainFixtureTransport() private pure returns (bytes memory) {
        return _type2Transport(
            7, FIXTURE_TO, false, 123_456_789, hex"", 1, bytes32(uint256(0x1234)), bytes32(uint256(0x5678))
        );
    }

    function _creationEdgeTransport() private pure returns (bytes memory) {
        return _type2Transport(0, address(0), true, 0, hex"00", 0, bytes32(uint256(1)), bytes32(uint256(0x80)));
    }

    /// @dev Maps the vendored decoded fields onto the source-owned M02
    ///      normalized transaction that the reconstruction oracle consumes.
    function _normalizedFromDecoded(EvmV1Decoder.DecodedTransactionType2 memory decoded)
        private
        pure
        returns (TransactionType2V1.NormalizedType2Transaction memory normalized)
    {
        normalized = TransactionType2V1.NormalizedType2Transaction({
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
    }

    /// @dev The frozen M02 fixture the application-side guard operates on.
    function _m02Fixture() private pure returns (TransactionType2V1.NormalizedType2Transaction memory transaction) {
        transaction = TransactionType2V1.NormalizedType2Transaction({
            txType: 2,
            chainId: 11_155_111,
            nonce: 7,
            maxPriorityFeePerGas: 1_000_000_000,
            maxFeePerGas: 2_000_000_000,
            gasLimit: 21_000,
            hasTo: true,
            to: FIXTURE_TO,
            value: 123_456_789,
            input: hex"",
            accessListLength: 0,
            yParity: 1,
            r: 0x1234,
            s: 0x5678
        });
    }
}

/// @dev Concrete-typed verify caller: passing typed arguments resolves the
///      vendored interface's single-proof overload. The emitted external call
///      is the canonical V1 Block Prover call; expectCall in the probe asserts
///      its byte-for-byte calldata. No duplicate application interface is
///      maintained — the call target is the vendored interface itself.
contract VerifyCallProbe {
    function prove(
        address target,
        uint64 chainKey,
        uint64 blockHeight,
        bytes memory encodedTransaction,
        INativeQueryVerifier.MerkleProof memory merkleProof,
        INativeQueryVerifier.ContinuityProof memory continuityProof
    ) public returns (bool) {
        return INativeQueryVerifier(target)
            .verify(chainKey, blockHeight, encodedTransaction, merkleProof, continuityProof);
    }
}
