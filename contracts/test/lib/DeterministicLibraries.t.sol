// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {MonsterGeneratorV1} from "../../src/lib/MonsterGeneratorV1.sol";
import {MonsterTypesV1} from "../../src/lib/MonsterTypesV1.sol";
import {TransactionDnaV1} from "../../src/lib/TransactionDnaV1.sol";
import {TransactionType2V1} from "../../src/lib/TransactionType2V1.sol";

contract DeterministicLibrariesTest is Test {
    bytes32 private constant DOMAIN_LEVEL = 0x061fbddcd4693061855e58ee274274cdb76c6fdd1e56b05c3dcc6b43b4357827;
    bytes32 private constant DOMAIN_ELEMENT = 0xf3549922386d10f4c332c69f3cb6c5f576110a658ef6ac3afb3e0b55e4ff77f7;
    bytes32 private constant DOMAIN_SPECIES = 0x1848e2ae1f663e29b7f5909820a90502818e1a71eecacc08af674e58635cfb3b;
    bytes32 private constant DOMAIN_RARITY = 0x719cb45f964b9a3762e17e0bc1fa15a857718422a2a00c7b6bb91def4850f8d8;
    bytes32 private constant DOMAIN_STAT_ALLOCATION =
        0xdcef4bec126e8a43392ec21e575d4a1d362d8f4bb91fe4ade415fdfb3cd17ce9;

    function testFrozenType2RawBytesAndSourceTx() public pure {
        TransactionType2V1.NormalizedType2Transaction memory transaction = _type2Fixture();
        bytes memory expectedRaw =
            hex"02f583aa36a707843b9aca00847735940082520894111111111111111111111111111111111111111184075bcd1580c001821234825678";
        bytes32 expectedSourceTx = 0xe8a1a631557a4b63768f2ea5dd7714f825ab39416d3e753c848e50e39dd24bab;

        assertEq(TransactionType2V1.reconstructSigned(transaction), expectedRaw);
        assertEq(TransactionType2V1.deriveCanonicalSourceTx(transaction), expectedSourceTx);
        assertEq(TransactionType2V1.bindCanonicalSourceTx(transaction, expectedSourceTx), expectedSourceTx);
    }

    function testContractCreationAndMinimalIntegers() public pure {
        TransactionType2V1.NormalizedType2Transaction memory transaction = _type2Fixture();
        transaction.nonce = 0;
        transaction.hasTo = false;
        transaction.value = 0;
        transaction.input = hex"00";
        transaction.yParity = 0;
        transaction.r = 1;
        transaction.s = 0x80;

        assertEq(
            TransactionType2V1.reconstructSigned(transaction),
            hex"02da83aa36a780843b9aca008477359400825208808000c080018180"
        );
    }

    function testUnsupportedType2ProfileReverts() public {
        TransactionType2V1.NormalizedType2Transaction memory transaction = _type2Fixture();

        transaction.txType = 1;
        vm.expectRevert(abi.encodeWithSelector(TransactionType2V1.UnsupportedTransactionType.selector, uint8(1)));
        this.reconstruct(transaction);

        transaction = _type2Fixture();
        transaction.chainId = 1;
        vm.expectRevert(abi.encodeWithSelector(TransactionType2V1.UnsupportedChainId.selector, uint256(1)));
        this.reconstruct(transaction);

        transaction = _type2Fixture();
        transaction.accessListLength = 1;
        vm.expectRevert(TransactionType2V1.UnsupportedAccessList.selector);
        this.reconstruct(transaction);

        transaction = _type2Fixture();
        transaction.yParity = 2;
        vm.expectRevert(abi.encodeWithSelector(TransactionType2V1.InvalidYParity.selector, uint8(2)));
        this.reconstruct(transaction);
    }

    function testFrozenDnaAndNamedSamples() public pure {
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
    }

    function testUniformBelowRangeAndExhaustion() public {
        uint256[4] memory samples = [uint256(0), uint256(10), uint256(0), uint256(0)];
        assertEq(MonsterGeneratorV1.uniformBelowFromSamples(DOMAIN_LEVEL, 10, samples), 0);

        samples = [uint256(0), uint256(0), uint256(0), uint256(0)];
        vm.expectRevert(abi.encodeWithSelector(MonsterGeneratorV1.GenerationSamplingExhausted.selector, DOMAIN_LEVEL));
        this.uniformBelowFromSamples(DOMAIN_LEVEL, 10, samples);
    }

    function testVectorsAThroughC() public pure {
        _assertMonster(0x03c4594447d168c8bf50701a468dfb08d85e06f4496f3315d6359f134ede6da8, 7, 3, 800, 1200, 2, 1);
        _assertMonster(0x0200000000000000000000000000000000000000000000000000000000000002, 5, 2, 1000, 1000, 2, 3);
        _assertMonster(0x010000000000000000000000000000000000000000000000000000000000000d, 3, 6, 1560, 1040, 0, 0);
    }

    function testCanonicalResolvedMonsterType() public pure {
        bytes32 dna = 0x03c4594447d168c8bf50701a468dfb08d85e06f4496f3315d6359f134ede6da8;
        bytes32 sourceTx = 0xe8a1a631557a4b63768f2ea5dd7714f825ab39416d3e753c848e50e39dd24bab;
        MonsterTypesV1.GeneratedMonsterV1 memory generated = MonsterGeneratorV1.generateMonster(dna);
        MonsterTypesV1.ResolvedMonsterV1 memory resolved = MonsterTypesV1.ResolvedMonsterV1({
            speciesId: generated.speciesId,
            level: generated.level,
            atk: generated.atk,
            def: generated.def,
            element: generated.element,
            rarity: generated.rarity,
            transactionDNA: generated.transactionDNA,
            sourceTx: sourceTx
        });

        assertEq(
            keccak256(abi.encode(generated)),
            keccak256(
                abi.encode(
                    resolved.speciesId,
                    resolved.level,
                    resolved.atk,
                    resolved.def,
                    resolved.element,
                    resolved.rarity,
                    resolved.transactionDNA
                )
            )
        );
        assertEq(resolved.sourceTx, sourceTx);
    }

    function testInvalidActivityClassReverts() public {
        vm.expectRevert(abi.encodeWithSelector(TransactionDnaV1.InvalidActivityClass.selector, uint8(6)));
        this.generateMonster(0x0600000000000000000000000000000000000000000000000000000000000000);
    }

    function testFuzzBoundsConservationAndRepeat(uint248 payload, uint8 activity) public pure {
        activity = activity % 6;
        bytes32 dna = bytes32((uint256(activity) << 248) | uint256(payload));
        MonsterTypesV1.GeneratedMonsterV1 memory first = MonsterGeneratorV1.generateMonster(dna);
        MonsterTypesV1.GeneratedMonsterV1 memory second = MonsterGeneratorV1.generateMonster(dna);

        assertEq(keccak256(abi.encode(first)), keccak256(abi.encode(second)));
        assertGe(first.level, 1);
        assertLe(first.level, 6);
        assertGe(first.speciesId, uint16(activity) * 2 + 1);
        assertLe(first.speciesId, uint16(activity) * 2 + 2);
        assertGe(first.atk, 800);
        assertLe(first.atk, 1560);
        assertGe(first.def, 800);
        assertLe(first.def, 1560);
        assertEq(uint256(first.atk) + first.def, first.level <= 3 ? 2_000 : 2_600);
        assertEq(first.transactionDNA, dna);
    }

    function testSourceTxCannotInfluencePureGeneration() public pure {
        bytes32 dna = 0x03c4594447d168c8bf50701a468dfb08d85e06f4496f3315d6359f134ede6da8;
        bytes32 sourceTxA = bytes32(uint256(1));
        bytes32 sourceTxB = bytes32(uint256(2));
        MonsterTypesV1.GeneratedMonsterV1 memory first = MonsterGeneratorV1.generateMonster(dna);
        MonsterTypesV1.GeneratedMonsterV1 memory second = MonsterGeneratorV1.generateMonster(dna);

        assertTrue(sourceTxA != sourceTxB);
        assertEq(keccak256(abi.encode(first)), keccak256(abi.encode(second)));
    }

    function reconstruct(TransactionType2V1.NormalizedType2Transaction memory transaction)
        external
        pure
        returns (bytes memory)
    {
        return TransactionType2V1.reconstructSigned(transaction);
    }

    function generateMonster(bytes32 dna) external pure returns (MonsterTypesV1.GeneratedMonsterV1 memory) {
        return MonsterGeneratorV1.generateMonster(dna);
    }

    function uniformBelowFromSamples(bytes32 domainId, uint256 n, uint256[4] memory samples)
        external
        pure
        returns (uint256)
    {
        return MonsterGeneratorV1.uniformBelowFromSamples(domainId, n, samples);
    }

    function _type2Fixture() private pure returns (TransactionType2V1.NormalizedType2Transaction memory transaction) {
        transaction = TransactionType2V1.NormalizedType2Transaction({
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
    }

    function _assertMonster(
        bytes32 dna,
        uint16 speciesId,
        uint8 level,
        uint16 atk,
        uint16 def,
        uint8 element,
        uint8 rarity
    ) private pure {
        MonsterTypesV1.GeneratedMonsterV1 memory monster = MonsterGeneratorV1.generateMonster(dna);
        assertEq(monster.speciesId, speciesId);
        assertEq(monster.level, level);
        assertEq(monster.atk, atk);
        assertEq(monster.def, def);
        assertEq(monster.element, element);
        assertEq(monster.rarity, rarity);
        assertEq(monster.transactionDNA, dna);
    }
}
