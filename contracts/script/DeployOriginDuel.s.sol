// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Script} from "forge-std/Script.sol";
import {MonsterFactoryASC} from "../src/MonsterFactoryASC.sol";
import {MonsterMarketplace} from "../src/MonsterMarketplace.sol";
import {MonsterNFT} from "../src/MonsterNFT.sol";

/// @title Origin Duel deterministic V1 deployment script
/// @notice EOA CREATE nonce precomputation + exact deployment order:
///         NFT(n) -> Factory(n+1) -> Marketplace(n+2). The Factory binding is
///         circular with the NFT, so every address is predicted before any
///         broadcast. A partial attempt consumes nonces: restarts MUST
///         recompute all predictions from the current chain nonce and never
///         mutate an old NFT Factory binding to repair an attempt.
contract DeployOriginDuel is Script {
    /// @dev Canonical Creditcoin Testnet chainId (V1 testnet deployment only).
    uint256 internal constant CREDITCOIN_TESTNET_CHAIN_ID = 102_031;
    /// @dev Canonical Attestcoin Block Prover precompile.
    address internal constant BLOCK_PROVER = 0x0000000000000000000000000000000000000FD2;

    address internal deployer;
    address internal assetApprovalSigner;
    uint64 internal captureGenesisBlock;

    /// @notice Pure address prediction helper, reusable by unit tests without
    ///         any broadcast state.
    function predictAddresses(address deployer_, uint256 nonce)
        public
        pure
        returns (address nft, address factory, address marketplace)
    {
        nft = vm.computeCreateAddress(deployer_, nonce);
        factory = vm.computeCreateAddress(deployer_, nonce + 1);
        marketplace = vm.computeCreateAddress(deployer_, nonce + 2);
    }

    /// @notice Full deterministic deployment. Environment (required):
    ///         DEPLOYER_ADDRESS, ASSET_APPROVAL_SIGNER, CAPTURE_GENESIS_BLOCK.
    ///         A real testnet run must use sequential broadcast (`--slow`).
    function run() public {
        deployer = vm.envAddress("DEPLOYER_ADDRESS");
        assetApprovalSigner = vm.envAddress("ASSET_APPROVAL_SIGNER");
        captureGenesisBlock = uint64(vm.envUint("CAPTURE_GENESIS_BLOCK"));

        // Chain gate before any broadcast path: V1 testnet only.
        require(block.chainid == CREDITCOIN_TESTNET_CHAIN_ID, "wrong chain: expected Creditcoin Testnet 102031");

        uint64 nonce = vm.getNonce(deployer);
        (address predictedNft, address predictedFactory, address predictedMarketplace) =
            predictAddresses(deployer, nonce);

        vm.startBroadcast(deployer);

        // 1. NFT with the Factory binding predicted from the same run.
        MonsterNFT nft = new MonsterNFT(predictedFactory, "Origin Duel Monster", "ODM");
        require(address(nft) == predictedNft, "NFT address prediction drift");

        // 2. Factory bound to the predicted (now actual) NFT address.
        MonsterFactoryASC factory = new MonsterFactoryASC(nft, assetApprovalSigner, BLOCK_PROVER, captureGenesisBlock);
        require(address(factory) == predictedFactory, "Factory address prediction drift");

        // 3. Marketplace bound to the same NFT.
        MonsterMarketplace marketplace = new MonsterMarketplace(nft);
        require(address(marketplace) == predictedMarketplace, "Marketplace address prediction drift");

        vm.stopBroadcast();

        // Post-deployment binding assertions.
        require(address(nft.factory()) == address(factory), "NFT Factory binding mismatch");
        require(address(factory.monsterNFT()) == address(nft), "Factory NFT binding mismatch");
        require(address(marketplace.nft()) == address(nft), "Marketplace NFT binding mismatch");
    }
}
