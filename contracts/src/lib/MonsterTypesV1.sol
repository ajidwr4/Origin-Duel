// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

library MonsterTypesV1 {
    struct GeneratedMonsterV1 {
        uint16 speciesId;
        uint8 level;
        uint16 atk;
        uint16 def;
        uint8 element;
        uint8 rarity;
        bytes32 transactionDNA;
    }

    struct ResolvedMonsterV1 {
        uint16 speciesId;
        uint8 level;
        uint16 atk;
        uint16 def;
        uint8 element;
        uint8 rarity;
        bytes32 transactionDNA;
        bytes32 sourceTx;
    }
}
