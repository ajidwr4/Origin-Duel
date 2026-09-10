// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {EvmV1Decoder} from "../lib/asc-contracts/contracts/common/EvmV1Decoder.sol";
import {INativeQueryVerifier} from "../lib/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MonsterGeneratorV1} from "./lib/MonsterGeneratorV1.sol";
import {MonsterTypesV1} from "./lib/MonsterTypesV1.sol";
import {MonsterNFT} from "./MonsterNFT.sol";
import {TransactionDnaV1} from "./lib/TransactionDnaV1.sol";
import {TransactionType2V1} from "./lib/TransactionType2V1.sol";

/// @title Origin Duel MonsterFactoryASC V1 — canonical capture authority
/// @notice Authoritative Attestcoin capture validation: Block Prover proof,
///         pinned internal decoder, exact V1 profile checks, canonical sourceTx
///         reconstruction/binding, replay/cooldown state, deterministic Monster
///         generation, SignedAssetApproval presentation authorization, and the
///         atomic finalCapture mutation path.
contract MonsterFactoryASC is EIP712, ReentrancyGuard {
    // ---------------------------------------------------------------- errors
    error InvalidChainKey(uint64 actual);
    error EncodedTransactionTooLarge(uint256 actualBytes, uint256 maxBytes);
    error ProofVerificationFailed();
    error UnsupportedTransactionProfile(uint8 txType);
    error InvalidSourceChainId(uint256 actualChainId);
    error NonEmptyAccessList();
    error FailedSourceTransaction(uint8 receiptStatus);
    error InvalidClaimant(address expected, address actual);
    error BelowCaptureGenesis(uint64 blockHeight, uint64 minimumBlockHeight);
    error ClaimedHashMismatch(bytes32 claimedTxHash, bytes32 derivedCanonicalTxHash);
    error SourceAlreadyConsumed(bytes32 sourceTx, uint256 tokenId);
    error CaptureCooldownActive(uint64 cooldownEndsAt);
    error InvalidMonsterBounds();

    // ------------------------------------------------------------- ActivityClass
    uint8 internal constant ACTIVITY_UNKNOWN = 0;
    uint8 internal constant ACTIVITY_NATIVE_TRANSFER = 1;
    uint8 internal constant ACTIVITY_ERC20_ACTIVITY = 2;
    uint8 internal constant ACTIVITY_ERC721_ACTIVITY = 3;
    uint8 internal constant ACTIVITY_ERC1155_ACTIVITY = 4;
    uint8 internal constant ACTIVITY_CONTRACT_INTERACTION = 5;

    // ------------------------------------------------------------ resource bounds
    uint256 internal constant MAX_ENCODED_TRANSACTION_BYTES_V1 = 65_536;
    uint256 internal constant MAX_CLASSIFIER_LOGS_V1 = 64;
    uint256 internal constant MAX_CLASSIFIER_LOG_DATA_BYTES_V1 = 8_192;

    // ------------------------------------------------------------- environment V1
    uint64 internal constant ATTESTCOIN_CHAIN_KEY = 1;
    uint256 internal constant SOURCE_CHAIN_ID_SEPOLIA = 11_155_111;
    uint64 internal constant CAPTURE_COOLDOWN_SECONDS = 60;

    bytes32 internal constant TRANSFER_ERC20_ERC721_SIGNATURE = keccak256("Transfer(address,address,uint256)");
    bytes32 internal constant TRANSFER_SINGLE_SIGNATURE =
        keccak256("TransferSingle(address,address,address,uint256,uint256)");
    bytes32 internal constant TRANSFER_BATCH_SIGNATURE =
        keccak256("TransferBatch(address,address,address,uint256[],uint256[])");

    // ------------------------------------------------------------------- types
    struct ProofPayloadV1 {
        uint64 chainKey;
        uint64 blockHeight;
        bytes encodedTransaction;
        bytes32 merkleRoot;
        INativeQueryVerifier.MerkleProofEntry[] siblings;
        bytes32 lowerEndpointDigest;
        bytes32[] continuityRoots;
    }

    struct EligibilityViewV1 {
        uint256 consumedTokenPlusOne;
        uint64 cooldownEndsAt;
        bool replayUnused;
        bool cooldownReady;
    }

    struct CanonicalPreflightResultV1 {
        MonsterTypesV1.ResolvedMonsterV1 monster;
        EligibilityViewV1 eligibility;
    }

    // ---------------------------------------------------------------- config
    MonsterNFT public immutable monsterNFT;
    address public immutable assetApprovalSigner;
    INativeQueryVerifier public immutable blockProver;
    uint64 public immutable CAPTURE_GENESIS_BLOCK;

    // T04 owns reads only; finalCapture (M03-T05) owns all writes.
    mapping(bytes32 => uint256) public sourceTxToTokenPlusOne;
    mapping(address => uint64) public lastCaptureAt;

    constructor(MonsterNFT monsterNFT_, address assetApprovalSigner_, address blockProver_, uint64 captureGenesisBlock_)
        EIP712("Origin Duel Asset Approval", "1")
    {
        monsterNFT = monsterNFT_;
        assetApprovalSigner = assetApprovalSigner_;
        blockProver = INativeQueryVerifier(blockProver_);
        CAPTURE_GENESIS_BLOCK = captureGenesisBlock_;
    }

    // ----------------------------------------------------------------- views
    function CAPTURE_COOLDOWN() external pure returns (uint64) {
        return CAPTURE_COOLDOWN_SECONDS;
    }

    function lookupReplay(bytes32 sourceTx) external view returns (uint256 tokenPlusOne) {
        return sourceTxToTokenPlusOne[sourceTx];
    }

    function readEligibility(address claimant, bytes32 sourceTx)
        public
        view
        returns (EligibilityViewV1 memory eligibility)
    {
        uint256 consumed = sourceTxToTokenPlusOne[sourceTx];
        uint64 cooldownEndsAt = lastCaptureAt[claimant] + CAPTURE_COOLDOWN_SECONDS;
        return EligibilityViewV1({
            consumedTokenPlusOne: consumed,
            cooldownEndsAt: cooldownEndsAt,
            replayUnused: consumed == 0,
            // 0 + 60 <= now is ready; an address that never captured stays ready.
            cooldownReady: block.timestamp >= cooldownEndsAt
        });
    }

    function lastCaptureAtExternal(address claimant) external view returns (uint64) {
        return lastCaptureAt[claimant];
    }

    // -------------------------------------------------------------- preflight
    function canonicalPreflight(bytes32 claimedTxHash, ProofPayloadV1 calldata proof)
        external
        view
        returns (CanonicalPreflightResultV1 memory result)
    {
        (MonsterTypesV1.ResolvedMonsterV1 memory monster,) = _validateSource(claimedTxHash, proof);
        result.monster = monster;
        result.eligibility = readEligibility(msg.sender, monster.sourceTx);
    }

    // ----------------------------------------------------------- final capture
    /// @dev Shared source validation used by BOTH canonicalPreflight and
    ///      finalCapture so the two paths can never drift semantically.
    function _validateSource(bytes32 claimedTxHash, ProofPayloadV1 calldata proof)
        internal
        view
        returns (MonsterTypesV1.ResolvedMonsterV1 memory monster, uint64 transactionIndex)
    {
        // Cheap resource/chain/genesis checks run before the expensive decode.
        if (proof.encodedTransaction.length > MAX_ENCODED_TRANSACTION_BYTES_V1) {
            revert EncodedTransactionTooLarge(proof.encodedTransaction.length, MAX_ENCODED_TRANSACTION_BYTES_V1);
        }
        if (proof.chainKey != ATTESTCOIN_CHAIN_KEY) revert InvalidChainKey(proof.chainKey);
        if (proof.blockHeight < CAPTURE_GENESIS_BLOCK) {
            revert BelowCaptureGenesis(proof.blockHeight, CAPTURE_GENESIS_BLOCK);
        }

        // ZONE 1: Block Prover inclusion/continuity verification.
        INativeQueryVerifier.MerkleProof memory merkleProof =
            INativeQueryVerifier.MerkleProof({root: proof.merkleRoot, siblings: proof.siblings});
        INativeQueryVerifier.ContinuityProof memory continuityProof = INativeQueryVerifier.ContinuityProof({
            lowerEndpointDigest: proof.lowerEndpointDigest, roots: proof.continuityRoots
        });
        if (!blockProver.verify(
                proof.chainKey, proof.blockHeight, proof.encodedTransaction, merkleProof, continuityProof
            )) {
            revert ProofVerificationFailed();
        }

        // transactionIndex is derived via the pinned Attestcoin proof/path
        // semantics AFTER proof PASS; caller-supplied indices are never
        // canonical (calculateTxIndex on the Block Prover precompile).
        transactionIndex = uint64(blockProver.calculateTxIndex(merkleProof));

        // ZONE 2: application profile checks over the pinned internal decoder.
        EvmV1Decoder.DecodedTransactionType2 memory decoded =
            EvmV1Decoder.decodeTransactionType2(proof.encodedTransaction);
        if (decoded.type2.chainId != SOURCE_CHAIN_ID_SEPOLIA) {
            revert InvalidSourceChainId(uint256(decoded.type2.chainId));
        }
        if (decoded.type2.accessList.length != 0) revert NonEmptyAccessList();
        if (decoded.receipt.receiptStatus != 1) revert FailedSourceTransaction(decoded.receipt.receiptStatus);
        if (decoded.commonTx.from != msg.sender) revert InvalidClaimant(decoded.commonTx.from, msg.sender);

        // Canonical sourceTx reconstruction and binding.
        TransactionType2V1.NormalizedType2Transaction memory normalized = _normalizedFromDecoded(decoded);
        bytes32 derivedCanonicalTxHash = TransactionType2V1.deriveCanonicalSourceTx(normalized);
        if (derivedCanonicalTxHash != claimedTxHash) {
            revert ClaimedHashMismatch(claimedTxHash, derivedCanonicalTxHash);
        }

        // Bounded evidence-shape classification, then deterministic generation.
        uint8 activityClass = _classify(decoded);
        (, bytes32 transactionDNA,) = TransactionDnaV1.derive(
            TransactionDnaV1.NormalizedTx({
                activityClass: activityClass,
                blockHeight: proof.blockHeight,
                transactionIndex: uint256(transactionIndex)
            })
        );
        MonsterTypesV1.GeneratedMonsterV1 memory generated = MonsterGeneratorV1.generateMonster(transactionDNA);
        _assertMonsterBounds(generated);

        monster = MonsterTypesV1.ResolvedMonsterV1({
            speciesId: generated.speciesId,
            level: generated.level,
            atk: generated.atk,
            def: generated.def,
            element: generated.element,
            rarity: generated.rarity,
            transactionDNA: generated.transactionDNA,
            sourceTx: derivedCanonicalTxHash
        });
    }

    event MonsterCaptured(
        address indexed claimant,
        bytes32 indexed sourceTx,
        uint256 indexed tokenId,
        bytes32 transactionDNA,
        bytes32 attemptKey,
        string tokenURI
    );

    // SignedAssetApproval presentation authorization (Phase 10 §28 exact).
    struct AssetApprovalV1 {
        address claimant;
        bytes32 sourceTx;
        bytes32 attemptKey;
        bytes32 monsterHash;
        string tokenURI;
        uint16 generationSpecVersion;
        uint16 artSpecVersion;
        uint16 metadataSpecVersion;
        uint64 validUntil;
    }

    struct SignedAssetApprovalV1 {
        AssetApprovalV1 approval;
        bytes signature;
    }

    bytes32 internal constant RESOLVED_MONSTER_HASH_DOMAIN = keccak256("BUIDL_CTC_RESOLVED_MONSTER_V1");

    bytes32 private constant ASSET_APPROVAL_TYPEHASH = keccak256(
        "AssetApprovalV1(address claimant,bytes32 sourceTx,bytes32 attemptKey,bytes32 monsterHash,string tokenURI,uint16 generationSpecVersion,uint16 artSpecVersion,uint16 metadataSpecVersion,uint64 validUntil)"
    );

    uint16 internal constant GENERATION_SPEC_VERSION_ACCEPTED = 1;
    uint16 internal constant ART_SPEC_VERSION_ACCEPTED = 1;
    uint16 internal constant METADATA_SPEC_VERSION_ACCEPTED = 1;

    error InvalidAssetApprovalSignature();
    error AssetApprovalExpired(uint64 validUntil);
    error AssetApprovalClaimantMismatch(address approved, address actual);
    error AssetApprovalSourceMismatch(bytes32 approved, bytes32 actual);
    error AssetApprovalMonsterMismatch(bytes32 approvedHash, bytes32 actualHash);
    error InvalidAssetSpecVersion(uint16 generation, uint16 art, uint16 metadata);
    error InvalidTokenURI();

    /// @notice Atomic final capture: recomputes the full source validation and
    ///         consumes the source exactly once. The NFT stays the sole token-ID
    ///         allocation authority via the expectedTokenId handshake.
    function finalCapture(
        bytes32 claimedTxHash,
        ProofPayloadV1 calldata proof,
        SignedAssetApprovalV1 calldata signedApproval
    ) external nonReentrant returns (uint256 tokenId) {
        // Full recomputation: never trusts an earlier preflight result.
        (MonsterTypesV1.ResolvedMonsterV1 memory monster,) = _validateSource(claimedTxHash, proof);

        _validateAssetApproval(signedApproval.approval, signedApproval.signature, monster);

        // Final mutation-time eligibility: current chain state only.
        bytes32 sourceTx = monster.sourceTx;
        uint256 consumed = sourceTxToTokenPlusOne[sourceTx];
        if (consumed != 0) revert SourceAlreadyConsumed(sourceTx, consumed - 1);
        uint64 cooldownEndsAt = lastCaptureAt[msg.sender] + CAPTURE_COOLDOWN_SECONDS;
        if (block.timestamp < cooldownEndsAt) revert CaptureCooldownActive(cooldownEndsAt);

        // CEI: all checks complete; read the NFT-owned token ID before effects.
        uint256 expectedTokenId = monsterNFT.nextTokenId();

        // Effects before the external mint call.
        sourceTxToTokenPlusOne[sourceTx] = expectedTokenId + 1;
        lastCaptureAt[msg.sender] = uint64(block.timestamp);

        tokenId = monsterNFT.mintFromFactory(expectedTokenId, msg.sender, monster, signedApproval.approval.tokenURI);
        if (tokenId != expectedTokenId) revert UnexpectedMintedTokenId(expectedTokenId, tokenId);

        emit MonsterCaptured(
            msg.sender,
            sourceTx,
            tokenId,
            monster.transactionDNA,
            signedApproval.approval.attemptKey,
            signedApproval.approval.tokenURI
        );
    }

    error UnexpectedMintedTokenId(uint256 expected, uint256 actual);

    /// @dev Presentation authorization: signature must recover the immutable
    ///      signer and every field must bind to the recomputed capture values.
    function _validateAssetApproval(
        AssetApprovalV1 calldata approval,
        bytes calldata signature,
        MonsterTypesV1.ResolvedMonsterV1 memory monster
    ) internal view {
        if (bytes(approval.tokenURI).length == 0) revert InvalidTokenURI();
        if (block.timestamp > approval.validUntil) revert AssetApprovalExpired(approval.validUntil);
        if (approval.claimant != msg.sender) {
            revert AssetApprovalClaimantMismatch(approval.claimant, msg.sender);
        }
        if (approval.sourceTx != monster.sourceTx) {
            revert AssetApprovalSourceMismatch(approval.sourceTx, monster.sourceTx);
        }
        bytes32 recomputedHash = resolvedMonsterHash(monster);
        if (approval.monsterHash != recomputedHash) {
            revert AssetApprovalMonsterMismatch(approval.monsterHash, recomputedHash);
        }
        if (
            approval.generationSpecVersion != GENERATION_SPEC_VERSION_ACCEPTED
                || approval.artSpecVersion != ART_SPEC_VERSION_ACCEPTED
                || approval.metadataSpecVersion != METADATA_SPEC_VERSION_ACCEPTED
        ) {
            revert InvalidAssetSpecVersion(
                approval.generationSpecVersion, approval.artSpecVersion, approval.metadataSpecVersion
            );
        }

        bytes32 structHash = keccak256(
            abi.encode(
                ASSET_APPROVAL_TYPEHASH,
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
        address recovered = ECDSA.recover(_hashTypedDataV4(structHash), signature);
        if (recovered != assetApprovalSigner) revert InvalidAssetApprovalSignature();
    }

    /// @notice Exact canonical ResolvedMonsterV1 hash (Phase 10 §28): abi.encode
    ///         with the domain constant, never packed.
    function resolvedMonsterHash(MonsterTypesV1.ResolvedMonsterV1 memory monster) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                RESOLVED_MONSTER_HASH_DOMAIN,
                monster.speciesId,
                monster.level,
                monster.atk,
                monster.def,
                monster.element,
                monster.rarity,
                monster.transactionDNA,
                monster.sourceTx
            )
        );
    }

    // ----------------------------------------------------------- classification
    function _classify(EvmV1Decoder.DecodedTransactionType2 memory decoded)
        internal
        pure
        returns (uint8 activityClass)
    {
        EvmV1Decoder.ReceiptFields memory receipt = decoded.receipt;
        if (receipt.receiptLogs.length > MAX_CLASSIFIER_LOGS_V1) {
            // Oversize log count maps straight to CONTRACT_INTERACTION; no
            // partial-prefix scan of the first N logs.
            return ACTIVITY_CONTRACT_INTERACTION;
        }

        address sourceActor = decoded.commonTx.from;
        bool hasErc20;
        bool hasErc721;
        bool hasErc1155;
        uint256 tokenClassCount;

        for (uint256 i = 0; i < receipt.receiptLogs.length; i++) {
            EvmV1Decoder.LogEntry memory log = receipt.receiptLogs[i];
            if (log.topics.length == 0) continue;
            if (log.data.length > MAX_CLASSIFIER_LOG_DATA_BYTES_V1) {
                // An oversized log cannot become token evidence; the scan
                // continues over the remaining bounded logs.
                continue;
            }
            bytes32 topic0 = log.topics[0];
            if (topic0 == TRANSFER_ERC20_ERC721_SIGNATURE && log.topics.length == 3) {
                if (
                    _isCanonicalAddressTopic(log.topics[1]) && _isCanonicalAddressTopic(log.topics[2])
                        && (_topicAddress(log.topics[1]) == sourceActor || _topicAddress(log.topics[2]) == sourceActor)
                        && log.data.length == 32
                ) {
                    if (!hasErc20) {
                        hasErc20 = true;
                        tokenClassCount++;
                    }
                }
            } else if (topic0 == TRANSFER_ERC20_ERC721_SIGNATURE && log.topics.length == 4) {
                if (
                    _isCanonicalAddressTopic(log.topics[1]) && _isCanonicalAddressTopic(log.topics[2])
                        && (_topicAddress(log.topics[1]) == sourceActor || _topicAddress(log.topics[2]) == sourceActor)
                        && log.data.length == 0
                ) {
                    if (!hasErc721) {
                        hasErc721 = true;
                        tokenClassCount++;
                    }
                }
            } else if (topic0 == TRANSFER_SINGLE_SIGNATURE && log.topics.length == 4) {
                if (
                    _isCanonicalAddressTopic(log.topics[1]) && _isCanonicalAddressTopic(log.topics[2])
                        && _isCanonicalAddressTopic(log.topics[3])
                        && (_topicAddress(log.topics[2]) == sourceActor || _topicAddress(log.topics[3]) == sourceActor)
                        && log.data.length == 64
                ) {
                    if (!hasErc1155) {
                        hasErc1155 = true;
                        tokenClassCount++;
                    }
                }
            } else if (topic0 == TRANSFER_BATCH_SIGNATURE && log.topics.length == 4) {
                if (_isBoundedCanonicalTransferBatch(log, sourceActor)) {
                    if (!hasErc1155) {
                        hasErc1155 = true;
                        tokenClassCount++;
                    }
                }
            }
            // Early exit is only legal once the final result can no longer
            // change: more than one token class is already CONTRACT_INTERACTION.
            if (tokenClassCount > 1) return ACTIVITY_CONTRACT_INTERACTION;
        }

        if (tokenClassCount > 1) return ACTIVITY_CONTRACT_INTERACTION;
        if (hasErc20) return ACTIVITY_ERC20_ACTIVITY;
        if (hasErc721) return ACTIVITY_ERC721_ACTIVITY;
        if (hasErc1155) return ACTIVITY_ERC1155_ACTIVITY;

        if (
            !decoded.commonTx.toIsNull && decoded.commonTx.value > 0 && decoded.commonTx.data.length == 0
                && receipt.receiptLogs.length == 0
        ) {
            return ACTIVITY_NATIVE_TRANSFER;
        }
        if (decoded.commonTx.toIsNull || decoded.commonTx.data.length > 0 || receipt.receiptLogs.length > 0) {
            return ACTIVITY_CONTRACT_INTERACTION;
        }
        return ACTIVITY_UNKNOWN;
    }

    /// @dev Structural TransferBatch validation using only offsets/length words;
    ///      ids/values elements are never iterated or used as evidence.
    function _isBoundedCanonicalTransferBatch(EvmV1Decoder.LogEntry memory log, address sourceActor)
        internal
        pure
        returns (bool)
    {
        if (
            !_isCanonicalAddressTopic(log.topics[1]) || !_isCanonicalAddressTopic(log.topics[2])
                || !_isCanonicalAddressTopic(log.topics[3])
        ) return false;
        if (_topicAddress(log.topics[2]) != sourceActor && _topicAddress(log.topics[3]) != sourceActor) return false;

        bytes memory data = log.data;
        // Canonical ABI for (uint256[] ids, uint256[] values): two head words
        // holding offsets measured from the start of the encoded arguments,
        // then each array's length word followed by its full words.
        if (data.length < 64 + 32 + 32) return false;
        uint256 idsHead = _readWord(data, 0);
        uint256 valuesHead = _readWord(data, 32);
        if (idsHead < 64 || idsHead % 32 != 0) return false;
        if (valuesHead < 64 || valuesHead % 32 != 0) return false;
        if (idsHead + 32 > data.length || valuesHead + 32 > data.length) return false;
        uint256 idsLength = _readWord(data, idsHead);
        uint256 valuesLength = _readWord(data, valuesHead);
        if (idsLength != valuesLength) return false;
        // Length must index whole words and the full arrays must stay inside
        // the bounded log data; the count cap keeps the area math small.
        if (idsLength > data.length / 32) return false;
        if (idsHead + 32 + idsLength * 32 > data.length) return false;
        if (valuesHead + 32 + valuesLength * 32 > data.length) return false;
        return true;
    }

    function _readWord(bytes memory data, uint256 offset) private pure returns (uint256 word) {
        assembly {
            word := mload(add(add(data, 32), offset))
        }
    }

    /// @dev Upper 96 bits zero, lower 160 bits are the address.
    function _isCanonicalAddressTopic(bytes32 topic) private pure returns (bool) {
        return uint256(topic) >> 160 == 0 && uint256(topic) != 0;
    }

    function _topicAddress(bytes32 topic) private pure returns (address) {
        return address(uint160(uint256(topic)));
    }

    // ------------------------------------------------------------- helpers
    function _normalizedFromDecoded(EvmV1Decoder.DecodedTransactionType2 memory decoded)
        internal
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

    /// @dev Defense-in-depth structural gate; generator semantics stay in M02.
    function _assertMonsterBounds(MonsterTypesV1.GeneratedMonsterV1 memory monster) internal pure {
        if (
            monster.level < 1 || monster.level > 6 || monster.atk < 800 || monster.atk > 1_560 || monster.def < 800
                || monster.def > 1_560 || uint256(monster.atk) + monster.def != (monster.level <= 3 ? 2_000 : 2_600)
        ) {
            revert InvalidMonsterBounds();
        }
    }
}
