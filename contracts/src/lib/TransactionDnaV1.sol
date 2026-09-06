// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

library TransactionDnaV1 {
    uint256 internal constant GENERATION_SPEC_VERSION = 1;

    bytes32 internal constant TRANSACTION_DNA_ENTROPY_DOMAIN =
        0xd891cfbba83871d32c54a3106a635eeae6e495b48b486a03cc350d2a3d4e97b6;
    bytes32 internal constant DOMAIN_SAMPLE_PREFIX = 0xffcdc59364285e629ed64257102cdfe73e2ffe86d269b2880f48c93a9859c129;

    error InvalidActivityClass(uint8 activityClass);

    struct NormalizedTx {
        uint8 activityClass;
        uint64 blockHeight;
        uint256 transactionIndex;
    }

    function derive(NormalizedTx memory normalized)
        internal
        pure
        returns (bytes32 entropyDigest, bytes32 transactionDNA, bytes32 entropySeed)
    {
        if (normalized.activityClass > 5) revert InvalidActivityClass(normalized.activityClass);

        entropyDigest = keccak256(
            abi.encode(
                TRANSACTION_DNA_ENTROPY_DOMAIN,
                GENERATION_SPEC_VERSION,
                normalized.blockHeight,
                normalized.transactionIndex
            )
        );
        uint256 entropyPayload = uint256(entropyDigest) & type(uint248).max;
        transactionDNA = bytes32((uint256(normalized.activityClass) << 248) | entropyPayload);
        entropySeed = bytes32(entropyPayload);
    }

    function activityClass(bytes32 transactionDNA) internal pure returns (uint8 result) {
        result = uint8(uint256(transactionDNA) >> 248);
        if (result > 5) revert InvalidActivityClass(result);
    }

    function entropySeed(bytes32 transactionDNA) internal pure returns (bytes32) {
        activityClass(transactionDNA);
        return bytes32(uint256(transactionDNA) & type(uint248).max);
    }

    function domainSample(bytes32 seed, bytes32 domainId, uint256 sampleIndex) internal pure returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_SAMPLE_PREFIX, GENERATION_SPEC_VERSION, seed, domainId, sampleIndex));
    }
}
