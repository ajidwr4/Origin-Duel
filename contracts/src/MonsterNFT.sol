// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {MonsterTypesV1} from "./lib/MonsterTypesV1.sol";

/// @title Origin Duel Monster NFT V1
/// @notice ERC-721 with NFT-owned sequential token allocation and immutable
/// Monster/tokenURI records. Mint authorization is the single immutable Factory;
/// the NFT itself remains the sole token-ID allocation authority.
contract MonsterNFT is ERC721 {
    error OnlyFactory();
    error UnexpectedTokenId(uint256 expected, uint256 actual);
    error InvalidMintRecipient();
    error InvalidMonsterSourceTx();

    address public immutable factory;

    /// @dev Next token to allocate; starts at 0 so failed mints leave no gap.
    uint256 public nextTokenId;

    // Immutable per-token records; written exactly once during mint.
    mapping(uint256 => MonsterTypesV1.ResolvedMonsterV1) private _monsters;
    mapping(uint256 => string) private _tokenURIs;

    constructor(address factory_, string memory name_, string memory symbol_) ERC721(name_, symbol_) {
        factory = factory_;
    }

    /// @notice Mint is Factory-only. The Factory does not choose token IDs;
    ///         it passes back the value previously read from `nextTokenId`.
    function mintFromFactory(
        uint256 expectedTokenId,
        address to,
        MonsterTypesV1.ResolvedMonsterV1 calldata monster,
        string calldata tokenURI_
    ) external returns (uint256 tokenId) {
        if (msg.sender != factory) revert OnlyFactory();
        if (expectedTokenId != nextTokenId) {
            revert UnexpectedTokenId(expectedTokenId, nextTokenId);
        }
        if (to == address(0)) revert InvalidMintRecipient();
        if (monster.sourceTx == bytes32(0)) revert InvalidMonsterSourceTx();

        tokenId = nextTokenId;
        // Reverting `_safeMint` rolls back the counter and both records with it.
        nextTokenId = tokenId + 1;
        _monsters[tokenId] = monster;
        _tokenURIs[tokenId] = tokenURI_;
        _safeMint(to, tokenId);
    }

    function monsterOf(uint256 tokenId) external view returns (MonsterTypesV1.ResolvedMonsterV1 memory monster) {
        _requireOwned(tokenId);
        return _monsters[tokenId];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _tokenURIs[tokenId];
    }
}
