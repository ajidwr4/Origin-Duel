// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {MonsterGeneratorV1} from "../../src/lib/MonsterGeneratorV1.sol";
import {TransactionDnaV1} from "../../src/lib/TransactionDnaV1.sol";
import {TransactionType2V1} from "../../src/lib/TransactionType2V1.sol";

contract DeterministicParityTest is Test {
    bytes32 private constant DOMAIN_LEVEL = 0x061fbddcd4693061855e58ee274274cdb76c6fdd1e56b05c3dcc6b43b4357827;
    bytes32 private constant DOMAIN_ELEMENT = 0xf3549922386d10f4c332c69f3cb6c5f576110a658ef6ac3afb3e0b55e4ff77f7;
    bytes32 private constant DOMAIN_SPECIES = 0x1848e2ae1f663e29b7f5909820a90502818e1a71eecacc08af674e58635cfb3b;
    bytes32 private constant DOMAIN_RARITY = 0x719cb45f964b9a3762e17e0bc1fa15a857718422a2a00c7b6bb91def4850f8d8;
    bytes32 private constant DOMAIN_STAT_ALLOCATION =
        0xdcef4bec126e8a43392ec21e575d4a1d362d8f4bb91fe4ade415fdfb3cd17ce9;

    function testTx01SourceOwnedType2Oracle() public pure {
        TransactionType2V1.NormalizedType2Transaction memory transaction = TransactionType2V1.NormalizedType2Transaction({
            txType: 2,
            chainId: 11_155_111,
            nonce: 7,
            maxPriorityFeePerGas: 1_000_000_000,
            maxFeePerGas: 2_000_000_000,
            gasLimit: 21_000,
            hasTo: true,
            to: address(0x1111111111111111111111111111111111111111),
            value: 123_456_789,
            input: hex"",
            accessListLength: 0,
            yParity: 1,
            r: 0x1234,
            s: 0x5678
        });

        assertEq(
            TransactionType2V1.reconstructSigned(transaction),
            hex"02f583aa36a707843b9aca00847735940082520894111111111111111111111111111111111111111184075bcd1580c001821234825678"
        );
        assertEq(
            TransactionType2V1.deriveCanonicalSourceTx(transaction),
            0xe8a1a631557a4b63768f2ea5dd7714f825ab39416d3e753c848e50e39dd24bab
        );
    }

    function testGen01SourceOwnedDnaSamplesAndVectors() public pure {
        (bytes32 digest, bytes32 dna, bytes32 seed) = TransactionDnaV1.derive(
            TransactionDnaV1.NormalizedTx({activityClass: 3, blockHeight: 6_000_000, transactionIndex: 42})
        );
        assertEq(digest, 0x2dc4594447d168c8bf50701a468dfb08d85e06f4496f3315d6359f134ede6da8);
        assertEq(dna, 0x03c4594447d168c8bf50701a468dfb08d85e06f4496f3315d6359f134ede6da8);
        assertEq(seed, 0x00c4594447d168c8bf50701a468dfb08d85e06f4496f3315d6359f134ede6da8);
        assertEq(
            TransactionDnaV1.domainSample(seed, DOMAIN_LEVEL, 0),
            0x51ecad2a428a282ac9399965a62fd9e1c127cd87bc5bca9d664dba68d6aca753
        );
        assertEq(
            TransactionDnaV1.domainSample(seed, DOMAIN_ELEMENT, 0),
            0x90f57f3ff3567349e5baa4573a63b08cec7ef95ed4a26ee3d01c5891d7077096
        );
        assertEq(
            TransactionDnaV1.domainSample(seed, DOMAIN_SPECIES, 0),
            0x30f589a8a9bea66b8ff7a15ada62efc75c89f00d66f0ca0686c9ff56ee9e24e0
        );
        assertEq(
            TransactionDnaV1.domainSample(seed, DOMAIN_RARITY, 0),
            0x8e07002a46e0195350d8993e2da775b091057cee24e06099c137e700554f835c
        );
        assertEq(
            TransactionDnaV1.domainSample(seed, DOMAIN_STAT_ALLOCATION, 0),
            0x20ccc8654b90ae24f179eabdf16cb7d2aeb4b7577feb5de92544cc4949695987
        );

        _assertMonster(dna, 7, 3, 800, 1200, MonsterGeneratorV1.Element.WIND, MonsterGeneratorV1.Rarity.RARE);
        _assertMonster(
            bytes32((uint256(2) << 248) | 2),
            5,
            2,
            1000,
            1000,
            MonsterGeneratorV1.Element.WIND,
            MonsterGeneratorV1.Rarity.LEGENDARY
        );
        _assertMonster(
            bytes32((uint256(1) << 248) | 13),
            3,
            6,
            1560,
            1040,
            MonsterGeneratorV1.Element.FIRE,
            MonsterGeneratorV1.Rarity.COMMON
        );
    }

    function _assertMonster(
        bytes32 dna,
        uint16 speciesId,
        uint8 level,
        uint16 atk,
        uint16 def,
        MonsterGeneratorV1.Element element,
        MonsterGeneratorV1.Rarity rarity
    ) private pure {
        MonsterGeneratorV1.GeneratedMonsterV1 memory monster = MonsterGeneratorV1.generateMonster(dna);
        assertEq(monster.speciesId, speciesId);
        assertEq(monster.level, level);
        assertEq(monster.atk, atk);
        assertEq(monster.def, def);
        assertEq(uint8(monster.element), uint8(element));
        assertEq(uint8(monster.rarity), uint8(rarity));
        assertEq(monster.transactionDNA, dna);
    }
}
