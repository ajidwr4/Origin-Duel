import { type ChildProcess, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MONSTERMARKETPLACE_ABI,
  MONSTERNFT_ABI,
} from "@origin-duel/contracts-abi";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
} from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creditcoinTestnet, sepoliaChain } from "./chains.ts";

/**
 * Local Anvil contract-read smoke (M05-T01 §8.6 E). Spawns a private local
 * Anvil (no Sepolia/Creditcoin/Proof Builder access), deploys the real
 * built MonsterNFT artifact through the Viem client + generated-ABI
 * boundary, asserts deterministic expected reads, and shuts Anvil down.
 * Skipped when `anvil` is unavailable so `npm test` on a machine without
 * Foundry is not faked as evidence.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../..");
const ARTIFACT = resolve(
  REPO_ROOT,
  "contracts/out/MonsterNFT.sol/MonsterNFT.json",
);

const ANVIL_PORT = 19_631; // fixed deterministic port, localhost-only private chain
const ANVIL_RPC = `http://127.0.0.1:${ANVIL_PORT}`;
// Anvil deterministic account #0 (public, local-only — never a secret).
const ANVIL_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;

const anvilAvailable = (() => {
  try {
    const result = Bun.which?.("anvil");
    return result !== undefined;
  } catch {
    return true; // Bun global not present in Node runtime: assume present, gate at spawn
  }
})();

const maybe = anvilAvailable ? describe : describe.skip;

interface AnvilHandle {
  process: ChildProcess;
  client: PublicClient;
  wallet: WalletClient;
}

let anvil: AnvilHandle | undefined;
let deployedNft: Address | undefined;

async function waitForAnvil(client: PublicClient): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await client.getBlockNumber();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`local anvil never became ready: ${String(lastError)}`);
}

beforeAll(async () => {
  let anvilProcess: ChildProcess;
  try {
    anvilProcess = spawn(
      "anvil",
      // --chain-id 102031 makes the private chain answer with the exact
      // Creditcoin Testnet id so the custom chain definition is exercised
      // against a real EVM endpoint (still localhost-only, never live).
      ["--port", String(ANVIL_PORT), "--chain-id", "102031", "--silent"],
      { stdio: "ignore" },
    );
  } catch {
    console.warn("anvil unavailable: skipping local read smoke");
    return;
  }

  const transport = http(ANVIL_RPC);
  // The smoke deploys on the custom creditcoin chain definition to prove the
  // custom chain config works against a real EVM endpoint too; the exact
  // chainId must be 102031.
  const client = createPublicClient({ chain: creditcoinTestnet, transport });
  const wallet = createWalletClient({
    account: ANVIL_ACCOUNT,
    chain: creditcoinTestnet,
    transport,
  });

  try {
    await waitForAnvil(client);
  } catch (error) {
    anvilProcess.kill("SIGKILL");
    throw error;
  }

  anvil = { process: anvilProcess, client, wallet };

  const { bytecode } = JSON.parse(readFileSync(ARTIFACT, "utf8")) as {
    bytecode: { object: string };
  };
  const predictedFactory =
    "0x1234567890123456789012345678901234567890" as Address;

  const deployHash = await wallet.deployContract({
    abi: MONSTERNFT_ABI,
    bytecode:
      `0x${bytecode.object.startsWith("0x") ? bytecode.object.slice(2) : bytecode.object}` as `0x${string}`,
    args: [predictedFactory, "Origin Duel Monster", "ODM"],
  });
  const receipt = await client.waitForTransactionReceipt({ hash: deployHash });
  if (receipt.contractAddress === null) {
    throw new Error("MonsterNFT deployment produced no contract address");
  }
  deployedNft = receipt.contractAddress;
}, 60_000);

afterAll(() => {
  anvil?.process.kill("SIGKILL");
});

maybe("local anvil contract-read smoke", () => {
  it("deploys real MonsterNFT bytecode and reads deterministic state", async () => {
    if (anvil === undefined || deployedNft === undefined) {
      throw new Error("anvil harness not initialized");
    }
    const { client } = anvil;

    const name = (await client.readContract({
      address: deployedNft,
      abi: MONSTERNFT_ABI,
      functionName: "name",
    })) as string;
    expect(name).toBe("Origin Duel Monster");

    const symbol = (await client.readContract({
      address: deployedNft,
      abi: MONSTERNFT_ABI,
      functionName: "symbol",
    })) as string;
    expect(symbol).toBe("ODM");

    const factory = (await client.readContract({
      address: deployedNft,
      abi: MONSTERNFT_ABI,
      functionName: "factory",
    })) as Address;
    expect(factory.toLowerCase()).toBe(
      "0x1234567890123456789012345678901234567890",
    );

    const nextTokenId = (await client.readContract({
      address: deployedNft,
      abi: MONSTERNFT_ABI,
      functionName: "nextTokenId",
    })) as bigint;
    expect(nextTokenId).toBe(0n);
  });

  it("exercises the viem client + generated ABI boundary on both chain definitions", async () => {
    if (anvil === undefined || deployedNft === undefined) {
      throw new Error("anvil harness not initialized");
    }
    // Sepolia-definition client against the same local endpoint: proves the
    // standard chain definition boundary is independently constructible.
    const sepoliaClient = createPublicClient({
      chain: sepoliaChain,
      transport: http(ANVIL_RPC),
    });
    expect(sepoliaClient.chain.id).toBe(11155111);
    const nextTokenId = (await sepoliaClient.readContract({
      address: deployedNft,
      abi: MONSTERNFT_ABI,
      functionName: "nextTokenId",
    })) as bigint;
    expect(nextTokenId).toBe(0n);

    // The marketplace ABI is consumed through getContract boundary as well.
    const { getMonsterMarketplace } = await import("./contracts.ts");
    const marketplace = getMonsterMarketplace(anvil.client, deployedNft);
    expect(marketplace.abi).toBe(MONSTERMARKETPLACE_ABI);
  });
});
