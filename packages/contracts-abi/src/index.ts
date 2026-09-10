// GENERATED from Foundry build artifacts (forge build) by M03-T05 ABI export.
// Do not edit by hand; regenerate from artifacts.
// GENERATED ABI exports for the Origin Duel V1 contracts.

export const MONSTERNFT_ABI = [
  {
    inputs: [
      { internalType: "address", name: "factory_", type: "address" },
      { internalType: "string", name: "name_", type: "string" },
      { internalType: "string", name: "symbol_", type: "string" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
    ],
    name: "approve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "factory",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "getApproved",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "operator", type: "address" },
    ],
    name: "isApprovedForAll",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "expectedTokenId", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      {
        components: [
          { internalType: "uint16", name: "speciesId", type: "uint16" },
          { internalType: "uint8", name: "level", type: "uint8" },
          { internalType: "uint16", name: "atk", type: "uint16" },
          { internalType: "uint16", name: "def", type: "uint16" },
          { internalType: "uint8", name: "element", type: "uint8" },
          { internalType: "uint8", name: "rarity", type: "uint8" },
          { internalType: "bytes32", name: "transactionDNA", type: "bytes32" },
          { internalType: "bytes32", name: "sourceTx", type: "bytes32" },
        ],
        internalType: "struct MonsterTypesV1.ResolvedMonsterV1",
        name: "monster",
        type: "tuple",
      },
      { internalType: "string", name: "tokenURI_", type: "string" },
    ],
    name: "mintFromFactory",
    outputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "monsterOf",
    outputs: [
      {
        components: [
          { internalType: "uint16", name: "speciesId", type: "uint16" },
          { internalType: "uint8", name: "level", type: "uint8" },
          { internalType: "uint16", name: "atk", type: "uint16" },
          { internalType: "uint16", name: "def", type: "uint16" },
          { internalType: "uint8", name: "element", type: "uint8" },
          { internalType: "uint8", name: "rarity", type: "uint8" },
          { internalType: "bytes32", name: "transactionDNA", type: "bytes32" },
          { internalType: "bytes32", name: "sourceTx", type: "bytes32" },
        ],
        internalType: "struct MonsterTypesV1.ResolvedMonsterV1",
        name: "monster",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "nextTokenId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "from", type: "address" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
    ],
    name: "safeTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "from", type: "address" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "bytes", name: "data", type: "bytes" },
    ],
    name: "safeTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "operator", type: "address" },
      { internalType: "bool", name: "approved", type: "bool" },
    ],
    name: "setApprovalForAll",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes4", name: "interfaceId", type: "bytes4" }],
    name: "supportsInterface",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "tokenURI",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "from", type: "address" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
    ],
    name: "transferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "approved",
        type: "address",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "Approval",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "operator",
        type: "address",
      },
      { indexed: false, internalType: "bool", name: "approved", type: "bool" },
    ],
    name: "ApprovalForAll",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "from", type: "address" },
      { indexed: true, internalType: "address", name: "to", type: "address" },
      {
        indexed: true,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    inputs: [
      { internalType: "address", name: "sender", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "address", name: "owner", type: "address" },
    ],
    name: "ERC721IncorrectOwner",
    type: "error",
  },
  {
    inputs: [
      { internalType: "address", name: "operator", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
    ],
    name: "ERC721InsufficientApproval",
    type: "error",
  },
  {
    inputs: [{ internalType: "address", name: "approver", type: "address" }],
    name: "ERC721InvalidApprover",
    type: "error",
  },
  {
    inputs: [{ internalType: "address", name: "operator", type: "address" }],
    name: "ERC721InvalidOperator",
    type: "error",
  },
  {
    inputs: [{ internalType: "address", name: "owner", type: "address" }],
    name: "ERC721InvalidOwner",
    type: "error",
  },
  {
    inputs: [{ internalType: "address", name: "receiver", type: "address" }],
    name: "ERC721InvalidReceiver",
    type: "error",
  },
  {
    inputs: [{ internalType: "address", name: "sender", type: "address" }],
    name: "ERC721InvalidSender",
    type: "error",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "ERC721NonexistentToken",
    type: "error",
  },
  { inputs: [], name: "InvalidMintRecipient", type: "error" },
  { inputs: [], name: "InvalidMonsterSourceTx", type: "error" },
  { inputs: [], name: "OnlyFactory", type: "error" },
  {
    inputs: [
      { internalType: "uint256", name: "expected", type: "uint256" },
      { internalType: "uint256", name: "actual", type: "uint256" },
    ],
    name: "UnexpectedTokenId",
    type: "error",
  },
] as const;

export const MONSTERMARKETPLACE_ABI = [
  {
    inputs: [
      { internalType: "contract MonsterNFT", name: "nft_", type: "address" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "buy",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "cancel",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "uint256", name: "price", type: "uint256" },
    ],
    name: "list",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "listingOf",
    outputs: [
      {
        components: [
          { internalType: "address", name: "seller", type: "address" },
          { internalType: "uint256", name: "price", type: "uint256" },
          { internalType: "bool", name: "exists", type: "bool" },
          { internalType: "bool", name: "executable", type: "bool" },
        ],
        internalType: "struct MonsterMarketplace.ListingViewV1",
        name: "listing",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "nft",
    outputs: [
      { internalType: "contract MonsterNFT", name: "", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "seller",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "price",
        type: "uint256",
      },
    ],
    name: "Listed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "seller",
        type: "address",
      },
    ],
    name: "ListingCancelled",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "seller",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "buyer",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "price",
        type: "uint256",
      },
    ],
    name: "Purchased",
    type: "event",
  },
  {
    inputs: [{ internalType: "address", name: "buyer", type: "address" }],
    name: "BuyerIsSeller",
    type: "error",
  },
  {
    inputs: [
      { internalType: "uint256", name: "expected", type: "uint256" },
      { internalType: "uint256", name: "actual", type: "uint256" },
    ],
    name: "IncorrectPayment",
    type: "error",
  },
  { inputs: [], name: "InvalidListingPrice", type: "error" },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "ListingNotFound",
    type: "error",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "ListingStale",
    type: "error",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "MarketplaceNotApproved",
    type: "error",
  },
  {
    inputs: [
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "address", name: "caller", type: "address" },
    ],
    name: "NotListingSeller",
    type: "error",
  },
  {
    inputs: [
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "address", name: "caller", type: "address" },
    ],
    name: "NotTokenOwner",
    type: "error",
  },
  {
    inputs: [
      { internalType: "address", name: "seller", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "PaymentFailed",
    type: "error",
  },
  { inputs: [], name: "ReentrancyGuardReentrantCall", type: "error" },
] as const;

export const MONSTERFACTORYASC_ABI = [
  {
    inputs: [
      {
        internalType: "contract MonsterNFT",
        name: "monsterNFT_",
        type: "address",
      },
      {
        internalType: "address",
        name: "assetApprovalSigner_",
        type: "address",
      },
      { internalType: "address", name: "blockProver_", type: "address" },
      { internalType: "uint64", name: "captureGenesisBlock_", type: "uint64" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "CAPTURE_COOLDOWN",
    outputs: [{ internalType: "uint64", name: "", type: "uint64" }],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [],
    name: "CAPTURE_GENESIS_BLOCK",
    outputs: [{ internalType: "uint64", name: "", type: "uint64" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "assetApprovalSigner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "blockProver",
    outputs: [
      {
        internalType: "contract INativeQueryVerifier",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "claimedTxHash", type: "bytes32" },
      {
        components: [
          { internalType: "uint64", name: "chainKey", type: "uint64" },
          { internalType: "uint64", name: "blockHeight", type: "uint64" },
          { internalType: "bytes", name: "encodedTransaction", type: "bytes" },
          { internalType: "bytes32", name: "merkleRoot", type: "bytes32" },
          {
            components: [
              { internalType: "bytes32", name: "hash", type: "bytes32" },
              { internalType: "bool", name: "isLeft", type: "bool" },
            ],
            internalType: "struct INativeQueryVerifier.MerkleProofEntry[]",
            name: "siblings",
            type: "tuple[]",
          },
          {
            internalType: "bytes32",
            name: "lowerEndpointDigest",
            type: "bytes32",
          },
          {
            internalType: "bytes32[]",
            name: "continuityRoots",
            type: "bytes32[]",
          },
        ],
        internalType: "struct MonsterFactoryASC.ProofPayloadV1",
        name: "proof",
        type: "tuple",
      },
    ],
    name: "canonicalPreflight",
    outputs: [
      {
        components: [
          {
            components: [
              { internalType: "uint16", name: "speciesId", type: "uint16" },
              { internalType: "uint8", name: "level", type: "uint8" },
              { internalType: "uint16", name: "atk", type: "uint16" },
              { internalType: "uint16", name: "def", type: "uint16" },
              { internalType: "uint8", name: "element", type: "uint8" },
              { internalType: "uint8", name: "rarity", type: "uint8" },
              {
                internalType: "bytes32",
                name: "transactionDNA",
                type: "bytes32",
              },
              { internalType: "bytes32", name: "sourceTx", type: "bytes32" },
            ],
            internalType: "struct MonsterTypesV1.ResolvedMonsterV1",
            name: "monster",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "consumedTokenPlusOne",
                type: "uint256",
              },
              {
                internalType: "uint64",
                name: "cooldownEndsAt",
                type: "uint64",
              },
              { internalType: "bool", name: "replayUnused", type: "bool" },
              { internalType: "bool", name: "cooldownReady", type: "bool" },
            ],
            internalType: "struct MonsterFactoryASC.EligibilityViewV1",
            name: "eligibility",
            type: "tuple",
          },
        ],
        internalType: "struct MonsterFactoryASC.CanonicalPreflightResultV1",
        name: "result",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "eip712Domain",
    outputs: [
      { internalType: "bytes1", name: "fields", type: "bytes1" },
      { internalType: "string", name: "name", type: "string" },
      { internalType: "string", name: "version", type: "string" },
      { internalType: "uint256", name: "chainId", type: "uint256" },
      { internalType: "address", name: "verifyingContract", type: "address" },
      { internalType: "bytes32", name: "salt", type: "bytes32" },
      { internalType: "uint256[]", name: "extensions", type: "uint256[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "claimedTxHash", type: "bytes32" },
      {
        components: [
          { internalType: "uint64", name: "chainKey", type: "uint64" },
          { internalType: "uint64", name: "blockHeight", type: "uint64" },
          { internalType: "bytes", name: "encodedTransaction", type: "bytes" },
          { internalType: "bytes32", name: "merkleRoot", type: "bytes32" },
          {
            components: [
              { internalType: "bytes32", name: "hash", type: "bytes32" },
              { internalType: "bool", name: "isLeft", type: "bool" },
            ],
            internalType: "struct INativeQueryVerifier.MerkleProofEntry[]",
            name: "siblings",
            type: "tuple[]",
          },
          {
            internalType: "bytes32",
            name: "lowerEndpointDigest",
            type: "bytes32",
          },
          {
            internalType: "bytes32[]",
            name: "continuityRoots",
            type: "bytes32[]",
          },
        ],
        internalType: "struct MonsterFactoryASC.ProofPayloadV1",
        name: "proof",
        type: "tuple",
      },
      {
        components: [
          {
            components: [
              { internalType: "address", name: "claimant", type: "address" },
              { internalType: "bytes32", name: "sourceTx", type: "bytes32" },
              { internalType: "bytes32", name: "attemptKey", type: "bytes32" },
              { internalType: "bytes32", name: "monsterHash", type: "bytes32" },
              { internalType: "string", name: "tokenURI", type: "string" },
              {
                internalType: "uint16",
                name: "generationSpecVersion",
                type: "uint16",
              },
              {
                internalType: "uint16",
                name: "artSpecVersion",
                type: "uint16",
              },
              {
                internalType: "uint16",
                name: "metadataSpecVersion",
                type: "uint16",
              },
              { internalType: "uint64", name: "validUntil", type: "uint64" },
            ],
            internalType: "struct MonsterFactoryASC.AssetApprovalV1",
            name: "approval",
            type: "tuple",
          },
          { internalType: "bytes", name: "signature", type: "bytes" },
        ],
        internalType: "struct MonsterFactoryASC.SignedAssetApprovalV1",
        name: "signedApproval",
        type: "tuple",
      },
    ],
    name: "finalCapture",
    outputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "lastCaptureAt",
    outputs: [{ internalType: "uint64", name: "", type: "uint64" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "claimant", type: "address" }],
    name: "lastCaptureAtExternal",
    outputs: [{ internalType: "uint64", name: "", type: "uint64" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "sourceTx", type: "bytes32" }],
    name: "lookupReplay",
    outputs: [
      { internalType: "uint256", name: "tokenPlusOne", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "monsterNFT",
    outputs: [
      { internalType: "contract MonsterNFT", name: "", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "claimant", type: "address" },
      { internalType: "bytes32", name: "sourceTx", type: "bytes32" },
    ],
    name: "readEligibility",
    outputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "consumedTokenPlusOne",
            type: "uint256",
          },
          { internalType: "uint64", name: "cooldownEndsAt", type: "uint64" },
          { internalType: "bool", name: "replayUnused", type: "bool" },
          { internalType: "bool", name: "cooldownReady", type: "bool" },
        ],
        internalType: "struct MonsterFactoryASC.EligibilityViewV1",
        name: "eligibility",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { internalType: "uint16", name: "speciesId", type: "uint16" },
          { internalType: "uint8", name: "level", type: "uint8" },
          { internalType: "uint16", name: "atk", type: "uint16" },
          { internalType: "uint16", name: "def", type: "uint16" },
          { internalType: "uint8", name: "element", type: "uint8" },
          { internalType: "uint8", name: "rarity", type: "uint8" },
          { internalType: "bytes32", name: "transactionDNA", type: "bytes32" },
          { internalType: "bytes32", name: "sourceTx", type: "bytes32" },
        ],
        internalType: "struct MonsterTypesV1.ResolvedMonsterV1",
        name: "monster",
        type: "tuple",
      },
    ],
    name: "resolvedMonsterHash",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    name: "sourceTxToTokenPlusOne",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  { anonymous: false, inputs: [], name: "EIP712DomainChanged", type: "event" },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "claimant",
        type: "address",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "sourceTx",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "transactionDNA",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "attemptKey",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "string",
        name: "tokenURI",
        type: "string",
      },
    ],
    name: "MonsterCaptured",
    type: "event",
  },
  {
    inputs: [
      { internalType: "address", name: "approved", type: "address" },
      { internalType: "address", name: "actual", type: "address" },
    ],
    name: "AssetApprovalClaimantMismatch",
    type: "error",
  },
  {
    inputs: [{ internalType: "uint64", name: "validUntil", type: "uint64" }],
    name: "AssetApprovalExpired",
    type: "error",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "approvedHash", type: "bytes32" },
      { internalType: "bytes32", name: "actualHash", type: "bytes32" },
    ],
    name: "AssetApprovalMonsterMismatch",
    type: "error",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "approved", type: "bytes32" },
      { internalType: "bytes32", name: "actual", type: "bytes32" },
    ],
    name: "AssetApprovalSourceMismatch",
    type: "error",
  },
  {
    inputs: [
      { internalType: "uint64", name: "blockHeight", type: "uint64" },
      { internalType: "uint64", name: "minimumBlockHeight", type: "uint64" },
    ],
    name: "BelowCaptureGenesis",
    type: "error",
  },
  {
    inputs: [
      { internalType: "uint64", name: "cooldownEndsAt", type: "uint64" },
    ],
    name: "CaptureCooldownActive",
    type: "error",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "claimedTxHash", type: "bytes32" },
      {
        internalType: "bytes32",
        name: "derivedCanonicalTxHash",
        type: "bytes32",
      },
    ],
    name: "ClaimedHashMismatch",
    type: "error",
  },
  { inputs: [], name: "ECDSAInvalidSignature", type: "error" },
  {
    inputs: [{ internalType: "uint256", name: "length", type: "uint256" }],
    name: "ECDSAInvalidSignatureLength",
    type: "error",
  },
  {
    inputs: [{ internalType: "bytes32", name: "s", type: "bytes32" }],
    name: "ECDSAInvalidSignatureS",
    type: "error",
  },
  {
    inputs: [
      { internalType: "uint256", name: "actualBytes", type: "uint256" },
      { internalType: "uint256", name: "maxBytes", type: "uint256" },
    ],
    name: "EncodedTransactionTooLarge",
    type: "error",
  },
  {
    inputs: [{ internalType: "uint8", name: "receiptStatus", type: "uint8" }],
    name: "FailedSourceTransaction",
    type: "error",
  },
  {
    inputs: [{ internalType: "bytes32", name: "domainId", type: "bytes32" }],
    name: "GenerationSamplingExhausted",
    type: "error",
  },
  {
    inputs: [{ internalType: "uint8", name: "activityClass", type: "uint8" }],
    name: "InvalidActivityClass",
    type: "error",
  },
  { inputs: [], name: "InvalidAssetApprovalSignature", type: "error" },
  {
    inputs: [
      { internalType: "uint16", name: "generation", type: "uint16" },
      { internalType: "uint16", name: "art", type: "uint16" },
      { internalType: "uint16", name: "metadata", type: "uint16" },
    ],
    name: "InvalidAssetSpecVersion",
    type: "error",
  },
  {
    inputs: [{ internalType: "uint64", name: "actual", type: "uint64" }],
    name: "InvalidChainKey",
    type: "error",
  },
  {
    inputs: [
      { internalType: "address", name: "expected", type: "address" },
      { internalType: "address", name: "actual", type: "address" },
    ],
    name: "InvalidClaimant",
    type: "error",
  },
  { inputs: [], name: "InvalidMonsterBounds", type: "error" },
  { inputs: [], name: "InvalidSampleRange", type: "error" },
  { inputs: [], name: "InvalidShortString", type: "error" },
  {
    inputs: [
      { internalType: "uint256", name: "actualChainId", type: "uint256" },
    ],
    name: "InvalidSourceChainId",
    type: "error",
  },
  { inputs: [], name: "InvalidTokenURI", type: "error" },
  {
    inputs: [{ internalType: "uint8", name: "yParity", type: "uint8" }],
    name: "InvalidYParity",
    type: "error",
  },
  { inputs: [], name: "NonEmptyAccessList", type: "error" },
  { inputs: [], name: "ProofVerificationFailed", type: "error" },
  { inputs: [], name: "ReentrancyGuardReentrantCall", type: "error" },
  {
    inputs: [
      { internalType: "bytes32", name: "sourceTx", type: "bytes32" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
    ],
    name: "SourceAlreadyConsumed",
    type: "error",
  },
  {
    inputs: [{ internalType: "string", name: "str", type: "string" }],
    name: "StringTooLong",
    type: "error",
  },
  {
    inputs: [
      { internalType: "uint256", name: "expected", type: "uint256" },
      { internalType: "uint256", name: "actual", type: "uint256" },
    ],
    name: "UnexpectedMintedTokenId",
    type: "error",
  },
  { inputs: [], name: "UnsupportedAccessList", type: "error" },
  {
    inputs: [{ internalType: "uint256", name: "chainId", type: "uint256" }],
    name: "UnsupportedChainId",
    type: "error",
  },
  {
    inputs: [{ internalType: "uint8", name: "txType", type: "uint8" }],
    name: "UnsupportedTransactionProfile",
    type: "error",
  },
  {
    inputs: [{ internalType: "uint8", name: "txType", type: "uint8" }],
    name: "UnsupportedTransactionType",
    type: "error",
  },
] as const;
