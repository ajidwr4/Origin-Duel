// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {TransactionDnaV1} from "./TransactionDnaV1.sol";

library MonsterGeneratorV1 {
    uint256 internal constant MAX_REJECTION_ATTEMPTS = 4;
    uint16 internal constant NORMAL_POWER_BUDGET = 2_000;
    uint16 internal constant TRIBUTE_POWER_BUDGET = 2_600;

    bytes32 internal constant DOMAIN_LEVEL = 0x061fbddcd4693061855e58ee274274cdb76c6fdd1e56b05c3dcc6b43b4357827;
    bytes32 internal constant DOMAIN_ELEMENT = 0xf3549922386d10f4c332c69f3cb6c5f576110a658ef6ac3afb3e0b55e4ff77f7;
    bytes32 internal constant DOMAIN_SPECIES = 0x1848e2ae1f663e29b7f5909820a90502818e1a71eecacc08af674e58635cfb3b;
    bytes32 internal constant DOMAIN_RARITY = 0x719cb45f964b9a3762e17e0bc1fa15a857718422a2a00c7b6bb91def4850f8d8;
    bytes32 internal constant DOMAIN_STAT_ALLOCATION =
        0xdcef4bec126e8a43392ec21e575d4a1d362d8f4bb91fe4ade415fdfb3cd17ce9;

    error InvalidSampleRange();
    error GenerationSamplingExhausted(bytes32 domainId);

    enum Element {
        FIRE,
        WATER,
        WIND
    }

    enum Rarity {
        COMMON,
        RARE,
        EPIC,
        LEGENDARY
    }

    struct GeneratedMonsterV1 {
        uint16 speciesId;
        uint8 level;
        uint16 atk;
        uint16 def;
        Element element;
        Rarity rarity;
        bytes32 transactionDNA;
    }

    function generateMonster(bytes32 transactionDNA) internal pure returns (GeneratedMonsterV1 memory monster) {
        uint8 activity = TransactionDnaV1.activityClass(transactionDNA);
        bytes32 seed = TransactionDnaV1.entropySeed(transactionDNA);

        monster.level = _resolveLevel(uniformBelow(seed, DOMAIN_LEVEL, 12));
        uint16 powerBudget = monster.level <= 3 ? NORMAL_POWER_BUDGET : TRIBUTE_POWER_BUDGET;
        uint256 profile = uniformBelow(seed, DOMAIN_STAT_ALLOCATION, 3);
        uint256 atkBps = profile == 0 ? 6_000 : profile == 1 ? 5_000 : 4_000;
        monster.atk = uint16((uint256(powerBudget) * atkBps) / 10_000);
        monster.def = powerBudget - monster.atk;
        monster.rarity = _resolveRarity(uniformBelow(seed, DOMAIN_RARITY, 100));
        monster.element = Element(uniformBelow(seed, DOMAIN_ELEMENT, 3));
        monster.speciesId = uint16(uint256(activity) * 2 + uniformBelow(seed, DOMAIN_SPECIES, 2) + 1);
        monster.transactionDNA = transactionDNA;
    }

    function uniformBelow(bytes32 seed, bytes32 domainId, uint256 n) internal pure returns (uint256) {
        if (n == 0) revert InvalidSampleRange();
        uint256 threshold = (type(uint256).max - n + 1) % n;
        for (uint256 index = 0; index < MAX_REJECTION_ATTEMPTS; index++) {
            uint256 sample = uint256(TransactionDnaV1.domainSample(seed, domainId, index));
            if (sample >= threshold) return sample % n;
        }
        revert GenerationSamplingExhausted(domainId);
    }

    function uniformBelowFromSamples(bytes32 domainId, uint256 n, uint256[4] memory samples)
        internal
        pure
        returns (uint256)
    {
        if (n == 0) revert InvalidSampleRange();
        uint256 threshold = (type(uint256).max - n + 1) % n;
        for (uint256 index = 0; index < MAX_REJECTION_ATTEMPTS; index++) {
            if (samples[index] >= threshold) return samples[index] % n;
        }
        revert GenerationSamplingExhausted(domainId);
    }

    function _resolveLevel(uint256 roll) private pure returns (uint8) {
        if (roll <= 2) return 1;
        if (roll <= 5) return 2;
        if (roll <= 8) return 3;
        if (roll == 9) return 4;
        if (roll == 10) return 5;
        return 6;
    }

    function _resolveRarity(uint256 roll) private pure returns (Rarity) {
        if (roll < 55) return Rarity.COMMON;
        if (roll < 80) return Rarity.RARE;
        if (roll < 95) return Rarity.EPIC;
        return Rarity.LEGENDARY;
    }
}
