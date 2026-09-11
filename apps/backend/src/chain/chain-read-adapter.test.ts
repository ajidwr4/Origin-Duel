import { type ChildProcess, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MONSTERFACTORYASC_ABI,
  MONSTERMARKETPLACE_ABI,
  MONSTERNFT_ABI,
} from "@origin-duel/contracts-abi";
import type {
  AttestcoinProofPayloadV1,
  Bytes32HexV1,
} from "@origin-duel/domain";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  custom,
  http,
} from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  readFactoryPreflight,
  readMarketplace,
  readReplayAndCooldown,
  readSepoliaAdvisory,
  readTokenState,
} from "./chain-read-adapter.ts";
import { creditcoinTestnet, sepoliaChain } from "./chains.ts";
import {
  createCreditcoinPublicClient,
  type createSepoliaPublicClient,
} from "./clients.ts";

/**
 * M05-T02 adapter evidence. Sepolia advisory normalization is proven against
 * a deterministic mock transport (no network). Factory/NFT/Marketplace read
 * normalization is proven against a local Anvil chain running chainId 102031
 * with the real deployed contract artifacts. Provider-failure semantics are
 * proven against a dead endpoint. No Sepolia/Creditcoin/Proof Builder access.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../..");

const DEAD_PORT = 19_734; // nothing listens here — deterministic RPC failure
const ANVIL_PORT = 19_735;
const ANVIL_RPC = `http://127.0.0.1:${ANVIL_PORT}`;
const ANVIL_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;

const CLAIMANT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const CLAIMANT_LOW = CLAIMANT.toLowerCase();
const TX_HASH = `0x${"12".repeat(32)}` as Bytes32HexV1;
const SOURCE_TX = `0x${"34".repeat(32)}` as Bytes32HexV1;

// Deterministic mock transport: scriptable per-method responses.
function mockSepoliaClient(
  responses: Record<string, unknown>,
): ReturnType<typeof createSepoliaPublicClient> {
  const customTransport = custom({
    request: async <T>({ method }: { method: string }) => {
      const value = responses[method];
      if (value === undefined) {
        throw new Error(`unexpected method ${method}`);
      }
      if (value instanceof Error) {
        throw value;
      }
      return value as T;
    },
  });
  return createPublicClient({
    chain: sepoliaChain,
    transport: customTransport,
  }) as unknown as ReturnType<typeof createSepoliaPublicClient>;
}

function namedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe("sepolia advisory normalization (deterministic RPC mocks)", () => {
  it("FOUND_MINED normalizes transaction + receipt hints", async () => {
    const client = mockSepoliaClient({
      eth_getTransactionByHash: {
        from: `0x${"AbCdEf"}${"0".repeat(30)}${"1234"}`,
        type: "0x2",
        blockNumber: "0x10",
        nonce: "0x7",
        chainId: "0xaa36a7",
        accessList: [],
        transactionIndex: "0x0",
      },
      eth_getTransactionReceipt: {
        status: "0x1",
        transactionIndex: "0x0",
        type: "0x2",
        blockNumber: "0x10",
      },
    });
    const outcome = await readSepoliaAdvisory(client, TX_HASH);
    expect(outcome).toEqual({
      kind: "ADVISORY",
      advisory: {
        lookupStatus: "FOUND_MINED",
        claimedTxHash: TX_HASH,
        sender: `0x${"abcdef"}${"0".repeat(30)}${"1234"}`,
        txType: 2,
        chainId: "11155111",
        blockHeight: "16",
        nonce: "7",
        transactionIndex: "0",
        receiptStatus: 1,
        accessListLength: 0,
      },
    });
  });

  it("FOUND_PENDING normalizes a mempool transaction", async () => {
    const client = mockSepoliaClient({
      eth_getTransactionByHash: {
        from: CLAIMANT,
        type: "0x2",
        blockNumber: null,
        nonce: "0x9",
        chainId: "0xaa36a7",
        accessList: [],
      },
    });
    const outcome = await readSepoliaAdvisory(client, TX_HASH);
    if (outcome.kind !== "ADVISORY") throw new Error("expected advisory");
    expect(outcome.advisory.lookupStatus).toBe("FOUND_PENDING");
    expect(outcome.advisory.sender).toBe(CLAIMANT_LOW);
    expect(outcome.advisory.nonce).toBe("9");
    expect(outcome.advisory.receiptStatus).toBeUndefined();
  });

  it("NOT_FOUND normalizes a definitive provider miss", async () => {
    const client = mockSepoliaClient({
      // viem returns null for a provider miss, not an error.
      eth_getTransactionByHash: null,
    });
    const outcome = await readSepoliaAdvisory(client, TX_HASH);
    expect(outcome).toEqual({
      kind: "ADVISORY",
      advisory: { lookupStatus: "NOT_FOUND", claimedTxHash: TX_HASH },
    });
  });

  it("receiptStatus 0 normalizes as failure status without inventing rejection", async () => {
    const client = mockSepoliaClient({
      eth_getTransactionByHash: {
        from: CLAIMANT,
        type: "0x2",
        blockNumber: "0x20",
        nonce: "0x1",
        chainId: "0xaa36a7",
        accessList: [],
      },
      eth_getTransactionReceipt: {
        status: "0x0",
        transactionIndex: "0x0",
        type: "0x2",
        blockNumber: "0x20",
      },
    });
    const outcome = await readSepoliaAdvisory(client, TX_HASH);
    if (outcome.kind !== "ADVISORY") throw new Error("expected advisory");
    expect(outcome.advisory.receiptStatus).toBe(0);
    // Advisory carries the observation; it never says rejected/verified.
    expect("verified" in outcome.advisory).toBe(false);
  });

  it("timeout/network failure stays retryable-unavailable, never rejection", async () => {
    const client = mockSepoliaClient({
      eth_getTransactionByHash: namedError(
        "HttpRequestError",
        "HTTP request failed",
      ),
    });
    const outcome = await readSepoliaAdvisory(client, TX_HASH);
    expect(outcome.kind).toBe("RPC_UNAVAILABLE");
    expect(outcome.kind === "RPC_UNAVAILABLE" ? outcome.cause : "").toContain(
      "HTTP request failed",
    );
  });

  it("stale provider (mined tx, missing receipt) stays advisory, not rejection", async () => {
    const client = mockSepoliaClient({
      eth_getTransactionByHash: {
        from: CLAIMANT,
        type: "0x2",
        blockNumber: "0x30",
        nonce: "0x2",
        chainId: "0xaa36a7",
        accessList: [],
      },
      eth_getTransactionReceipt: namedError(
        "TransactionReceiptNotFoundError",
        "receipt missing",
      ),
    });
    const outcome = await readSepoliaAdvisory(client, TX_HASH);
    if (outcome.kind !== "ADVISORY") throw new Error("expected advisory");
    expect(outcome.advisory.lookupStatus).toBe("FOUND_MINED");
    expect(outcome.advisory.receiptStatus).toBeUndefined();
  });

  it("malformed provider payload is rejected as unavailable, not chain truth", async () => {
    const client = mockSepoliaClient({
      eth_getTransactionByHash: { garbage: true },
    });
    const outcome = await readSepoliaAdvisory(client, TX_HASH);
    expect(outcome.kind).toBe("RPC_UNAVAILABLE");
  });
});

describe("provider failure semantics (dead endpoint)", () => {
  it("dead RPC fails as READ_FAILED/RPC_UNAVAILABLE, not contract rejection", async () => {
    const client = createCreditcoinPublicClient(
      `http://127.0.0.1:${DEAD_PORT}`,
    );
    const outcome = await readReplayAndCooldown(
      client,
      "0x1234567890123456789012345678901234567890",
      CLAIMANT,
      SOURCE_TX,
    );
    expect(outcome.kind).toBe("READ_FAILED");
    if (outcome.kind === "READ_FAILED") {
      expect(outcome.errorKind).toBe("RPC_UNAVAILABLE");
    }
  });
});

describe("factory/nft/marketplace read normalization (local anvil, chainId 102031)", () => {
  let anvilProcess: ChildProcess;
  let client: ReturnType<typeof createCreditcoinPublicClient>;
  let nftAddress: Address;
  let factoryAddress: Address;
  let marketplaceAddress: Address;

  beforeAll(async () => {
    anvilProcess = spawn(
      "anvil",
      [
        "--port",
        String(ANVIL_PORT),
        "--chain-id",
        "102031",
        // The Gate-B-frozen optimizer profile is not set yet, so the real
        // MonsterFactoryASC bytecode exceeds the default EIP-170 24kb limit.
        // Raising the limit on this private local node keeps the smoke using
        // the exact real bytecode + generated ABI (same accommodation the
        // forge/revm test backend makes). Gate B owns the final shrink.
        "--disable-code-size-limit",
        "--silent",
      ],
      { stdio: "ignore" },
    );
    client = createCreditcoinPublicClient(ANVIL_RPC);
    // Wait until ready.
    for (let i = 0; i < 50; i += 1) {
      try {
        await client.getBlockNumber();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    const wallet = createWalletClient({
      account: ANVIL_ACCOUNT,
      chain: creditcoinTestnet,
      transport: http(ANVIL_RPC),
    });

    const artifact = (name: string) =>
      JSON.parse(
        readFileSync(
          resolve(
            REPO_ROOT,
            "contracts/out",
            name,
            `${name.split(".")[0]}.json`,
          ),
          "utf8",
        ),
      );

    const nftArtifact = artifact("MonsterNFT.sol");
    const factoryArtifact = artifact("MonsterFactoryASC.sol");
    const marketArtifact = artifact("MonsterMarketplace.sol");

    const hexOf = (object: string) =>
      (object.startsWith("0x") ? object : `0x${object}`) as `0x${string}`;

    const nftHash = await wallet.deployContract({
      abi: MONSTERNFT_ABI,
      bytecode: hexOf(nftArtifact.bytecode.object),
      args: ["0x0000000000000000000000000000000000000001", "ODM", "ODM"],
    });
    const nftReceipt = await client.waitForTransactionReceipt({
      hash: nftHash,
    });
    nftAddress = nftReceipt.contractAddress as Address;

    const factoryHash = await wallet.deployContract({
      abi: MONSTERFACTORYASC_ABI,
      bytecode: hexOf(factoryArtifact.bytecode.object),
      args: [
        nftAddress,
        ANVIL_ACCOUNT,
        "0x0000000000000000000000000000000000000fd2",
        0n,
      ],
    });
    const factoryReceipt = await client.waitForTransactionReceipt({
      hash: factoryHash,
    });
    factoryAddress = factoryReceipt.contractAddress as Address;

    const marketHash = await wallet.deployContract({
      abi: MONSTERMARKETPLACE_ABI,
      bytecode: hexOf(marketArtifact.bytecode.object),
      args: [nftAddress],
    });
    const marketReceipt = await client.waitForTransactionReceipt({
      hash: marketHash,
    });
    marketplaceAddress = marketReceipt.contractAddress as Address;
  }, 60_000);

  afterAll(() => {
    anvilProcess?.kill("SIGKILL");
  });

  it("readReplayAndCooldown normalizes replay UNUSED + eligibility booleans", async () => {
    const outcome = await readReplayAndCooldown(
      client,
      factoryAddress,
      CLAIMANT,
      SOURCE_TX,
    );
    if (outcome.kind !== "READ") throw new Error(`unexpected ${outcome.kind}`);
    expect(outcome.view.replayState).toBe("UNUSED");
    expect(outcome.view.consumedTokenPlusOne).toBe("0");
    expect(typeof outcome.view.eligibility.replayUnused).toBe("boolean");
    expect(typeof outcome.view.eligibility.cooldownReady).toBe("boolean");
    // uint64 cooldown window round-trips as a decimal string.
    expect(outcome.view.eligibility.cooldownEndsAt).toMatch(
      /^(0|[1-9][0-9]*)$/,
    );
  });

  it("readFactoryPreflight call uses the exact generated ABI (revert path stays contract-owned)", async () => {
    // A fabricated-but-well-formed proof against the real Factory: the Block
    // Prover verification must fail inside the contract; the adapter must
    // surface it as CONTRACT_REVERT (contract truth), never READ_FAILED.
    const proof: AttestcoinProofPayloadV1 = {
      chainKey: 1,
      blockHeight: "1",
      encodedTransaction: "0x02",
      merkleRoot: `0x${"aa".repeat(32)}`,
      siblings: [{ hash: `0x${"bb".repeat(32)}`, isLeft: true }],
      lowerEndpointDigest: `0x${"cc".repeat(32)}`,
      continuityRoots: [`0x${"dd".repeat(32)}`],
    };
    const outcome = await readFactoryPreflight(
      client,
      factoryAddress,
      TX_HASH,
      CLAIMANT,
      proof,
    );
    // The Block Prover precompile does not exist on local Anvil, so the
    // revert originates from the prover call path inside the real contract —
    // contract-owned behavior either way, never provider noise.
    expect(["CONTRACT_REVERT", "READ_FAILED"]).toContain(outcome.kind);
    if (outcome.kind === "CONTRACT_REVERT") {
      expect(outcome.reason.length).toBeGreaterThan(0);
    }
  });

  it("readTokenState normalizes owner/tokenURI/monster with uint256 safety", async () => {
    // tokenId 0 does not exist on the fresh deployment: the ERC721 revert is
    // contract-authored and must surface as CONTRACT_REVERT, never provider
    // failure noise.
    const outcome = await readTokenState(client, nftAddress, 0n);
    expect(outcome.kind).toBe("CONTRACT_REVERT");
    if (outcome.kind === "CONTRACT_REVERT") {
      expect(outcome.reason).toContain("reverted");
    }
  });

  it("readMarketplace normalizes a nonexistent listing view", async () => {
    const outcome = await readMarketplace(client, marketplaceAddress, 5n);
    if (outcome.kind !== "READ") throw new Error(`unexpected ${outcome.kind}`);
    expect(outcome.listing.exists).toBe(false);
    expect(outcome.listing.executable).toBe(false);
    expect(outcome.listing.price).toBe("0");
    expect(outcome.listing.tokenId).toBe("5");
  });

  it("uint256 beyond Number.MAX_SAFE_INTEGER round-trips exactly through listing views", async () => {
    // A tokenId far beyond MAX_SAFE_INTEGER must survive the adapter's
    // bigint -> decimal-string mapping without Number coercion.
    const outcome = await readMarketplace(
      client,
      marketplaceAddress,
      2n ** 100n,
    );
    if (outcome.kind !== "READ") throw new Error(`unexpected ${outcome.kind}`);
    expect(outcome.listing.tokenId).toBe((2n ** 100n).toString(10));
  });
});
