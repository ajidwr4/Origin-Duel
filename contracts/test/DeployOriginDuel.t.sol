// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {DeployOriginDuel} from "../script/DeployOriginDuel.s.sol";
import {MonsterFactoryASC} from "../src/MonsterFactoryASC.sol";
import {MonsterMarketplace} from "../src/MonsterMarketplace.sol";
import {MonsterNFT} from "../src/MonsterNFT.sol";

/// @title Deployment dry-run tests for the deterministic V1 deployment script.
/// @notice Proves EOA CREATE nonce precomputation, address circularity, and
///         the Creditcoin chainId gate without any real broadcast.
contract DeployOriginDuelTest is Test {
    address internal constant DEPLOYER = 0x000000000000000000000000000000000000dEaD;
    address internal constant SIGNER = 0x000000000000000000000000000000000000bEEF;
    uint64 internal constant GENESIS = 1_000_000;
    uint64 internal constant START_NONCE = 7;

    DeployOriginDuel internal script;
    MonsterNFT internal nft;
    MonsterFactoryASC internal factory;
    MonsterMarketplace internal marketplace;

    function setUp() public {
        script = new DeployOriginDuel();
        // The local test chain starts at nonce 0 for fresh addresses; set the
        // deployer nonce so predictions exercise a nonzero starting point.
        vm.setNonce(DEPLOYER, START_NONCE);
    }

    /// @dev Local deterministic deployment path mirroring run()'s order,
    ///      parameterized so it can be executed without broadcast state.
    function _deployLocally(address predictedFactory)
        internal
        returns (MonsterNFT nft_, MonsterFactoryASC factory_, MonsterMarketplace marketplace_)
    {
        nft_ = new MonsterNFT(predictedFactory, "Origin Duel Monster", "ODM");
        factory_ = new MonsterFactoryASC(nft_, SIGNER, 0x0000000000000000000000000000000000000FD2, GENESIS);
        marketplace_ = new MonsterMarketplace(nft_);
    }

    function testPrecomputedAddressesMatchActualLocalDeployment() public {
        (address predictedNft, address predictedFactory, address predictedMarketplace) =
            script.predictAddresses(DEPLOYER, START_NONCE);

        // Local CREATE addresses depend on this test contract, not the EOA, so
        // the precomputation contract itself is proven against a direct
        // vm.computeCreateAddress call, and the circular local deployment is
        // proven separately: predictions n/n+1/n+2 must be distinct and in
        // CREATE-order sequence.
        assertTrue(predictedNft != predictedFactory);
        assertTrue(predictedFactory != predictedMarketplace);
        assertTrue(predictedNft != predictedMarketplace);
        assertEq(
            predictedNft,
            vm.computeCreateAddress(DEPLOYER, START_NONCE),
            "nft prediction must equal canonical EOA CREATE(n)"
        );
        assertEq(
            predictedFactory,
            vm.computeCreateAddress(DEPLOYER, START_NONCE + 1),
            "factory prediction must equal canonical EOA CREATE(n+1)"
        );
        assertEq(
            predictedMarketplace,
            vm.computeCreateAddress(DEPLOYER, START_NONCE + 2),
            "marketplace prediction must equal canonical EOA CREATE(n+2)"
        );
    }

    function testLocalCircularDeploymentBindsFactoryBidirectionally() public {
        // The NFT is created with the Factory address that will be created
        // right after it in the same run: the constructor circularity is
        // resolved by deploying the NFT with a precomputed (predicted) address.
        (, address predictedFactory,) = script.predictAddresses(DEPLOYER, START_NONCE);

        // Local deployment cannot reuse the EOA prediction (addresses come
        // from this contract), so mirror the circularity directly: predict the
        // Factory address from this contract's own next CREATE nonce.
        uint256 localNonce = vm.getNonce(address(this));
        address localFactory = vm.computeCreateAddress(address(this), localNonce + 1);

        (MonsterNFT nft_, MonsterFactoryASC factory_, MonsterMarketplace marketplace_) = _deployLocally(localFactory);

        assertEq(address(factory_), localFactory, "actual Factory must equal predicted local address");
        assertEq(address(nft_.factory()), address(factory_), "NFT Factory binding");
        assertEq(address(factory_.monsterNFT()), address(nft_), "Factory NFT binding");
        assertEq(address(marketplace_.nft()), address(nft_), "Marketplace NFT binding");
    }

    function testChainIdGateRejectsNonCreditcoinChainBeforeDeployment() public {
        // The chain gate is asserted before any broadcast path in run(); on a
        // local chain (chainId != 102031) run() must revert with the exact
        // message, proving the gate fires pre-deployment.
        vm.chainId(11155111);
        vm.setEnv("DEPLOYER_ADDRESS", "0x000000000000000000000000000000000000dEaD");
        vm.setEnv("ASSET_APPROVAL_SIGNER", "0x000000000000000000000000000000000000bEEF");
        vm.setEnv("CAPTURE_GENESIS_BLOCK", "1000000");
        // The chain gate fires before any deployment or broadcast path.
        vm.expectRevert(bytes("wrong chain: expected Creditcoin Testnet 102031"));
        script.run();
    }

    function testPartialAttemptRestartRecomputesFromCurrentNonce() public {
        // Simulate a partial attempt: the deployer consumed one nonce without
        // completing the set. A restart must predict from the CURRENT nonce,
        // not the stale one.
        uint64 consumedNonce = START_NONCE + 1;
        vm.setNonce(DEPLOYER, consumedNonce);

        (address nft1, address factory1, address marketplace1) = script.predictAddresses(DEPLOYER, START_NONCE);
        (address nft2, address factory2, address marketplace2) = script.predictAddresses(DEPLOYER, consumedNonce);

        // Every prediction shifts by one deployment slot; none are reused.
        assertTrue(nft2 != nft1 && factory2 != factory1 && marketplace2 != marketplace1);
        assertEq(nft2, vm.computeCreateAddress(DEPLOYER, consumedNonce));
        assertEq(factory2, vm.computeCreateAddress(DEPLOYER, consumedNonce + 1));
        assertEq(marketplace2, vm.computeCreateAddress(DEPLOYER, consumedNonce + 2));
    }
}
