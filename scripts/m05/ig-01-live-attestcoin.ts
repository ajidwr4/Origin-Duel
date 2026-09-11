/**
 * M05-T04 / IG-01 live Gate F harness (HFT-M05 §11.6). Orchestrates the exact
 * canonical chain:
 *
 *   real Sepolia Type-2 tx (profile-asserted from SEPOLIA_RPC_URL)
 *   → T03 Proof Builder client obtains + normalizes the proof
 *   → T01/T02 Creditcoin client calls the temporary Factory canonicalPreflight
 *     (which invokes the canonical Block Prover verify() precompile internally)
 *   → exact Factory sourceTx parity
 *   → independent TypeScript deterministic Monster parity
 *
 * Authority: none. The harness never verifies proofs itself and never treats
 * any provider response as Gate F truth — the Factory + Block Prover own that.
 * The TS Monster oracle is computed independently from the decoded transport
 * bytes (ethers ABI coder as the TEST-ONLY independent reference, mirroring
 * the SIG-01 precedent) and never from the Factory output.
 *
 * All sensitive inputs are environment-injected and never echoed.
 * Usage: tsx scripts/m05/ig-01-live-attestcoin.ts [--deploy-and-verify|--verify-existing]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MONSTERFACTORYASC_ABI,
  MONSTERMARKETPLACE_ABI,
  MONSTERNFT_ABI,
} from "@origin-duel/contracts-abi";
import {
  type ClassifierLogV1,
  classifyTransactionV1,
  deriveCanonicalSourceTxV1,
  deriveTransactionDnaV1,
  generateMonsterV1,
  resolveMonsterV1,
  type Type2TransactionV1,
} from "@origin-duel/domain";
import { AbiCoder } from "ethers";
import {
  type Address,
  createWalletClient,
  getContract,
  getContractAddress,
  http,
  publicActions,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createCreditcoinPublicClient,
  createSepoliaPublicClient,
  readFactoryPreflight,
} from "../../apps/backend/src/chain/index.ts";
import { createProofBuilderClient } from "../../apps/backend/src/proof/proof-builder-client.ts";
import { normalizeAttestcoinProof } from "../../apps/backend/src/proof/proof-normalization.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const MANIFEST_PATH = resolve(
  REPO_ROOT,
  "deployments/creditcoin-testnet.integration.json",
);

const CREDITCOIN_CHAIN_ID = 102_031;
const SEPOLIA_CHAIN_ID = 11_155_111;
const BLOCK_PROVER = "0x0000000000000000000000000000000000000fd2";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`missing required environment input ${name}`);
  }
  return value;
}

function fail(label: string): never {
  console.error(`IG01_FAIL: ${label}`);
  process.exit(1);
}

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) fail(label);
}

/** Bounded read-only transport retry for rate-limited hosted RPCs. */
async function withTransportRetry<T>(
  operation: () => Promise<T>,
  label: string,
  attempts = 5,
  backoffMs = 2_000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  return fail(
    `${label} failed after ${attempts} attempts: ${String(lastError).slice(0, 200)}`,
  );
}

interface TemporaryBuildProfileEvidence {
  purpose: "M05_GATE_F_TEMPORARY_ONLY";
  optimizer: boolean;
  optimizerRuns: number;
  viaIR: boolean;
  solc: "0.8.36";
  evmVersion: "shanghai";
  monsterFactoryDeployedBytecodeBytes: number;
  eip170LimitBytes: number;
}

interface IntegrationManifest {
  schema: string;
  purpose: "INTEGRATION_TEST_DEPLOYMENT";
  chainId: number;
  deployer: string;
  startingNonce: string;
  predictedNFT: string;
  predictedFactory: string;
  predictedMarketplace: string;
  actualNFT: string;
  actualFactory: string;
  actualMarketplace: string;
  assetApprovalSigner: string;
  captureGenesisBlock: string;
  blockProver: string;
  temporaryBuildProfile: TemporaryBuildProfileEvidence;
  deploymentTxHashes: string[];
  sourceTxHash: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Sepolia source transaction profile assertion (advisory, then exact frozen
// profile gate; Phase 4 profile: EIP1559_TYPE2_EMPTY_ACCESS_LIST_V1)
// ---------------------------------------------------------------------------

async function assertSepoliaType2Profile(): Promise<void> {
  const client = createSepoliaPublicClient(requiredEnv("SEPOLIA_RPC_URL"));
  const claimedTxHash = requiredEnv("M05_IG01_SEPOLIA_TX_HASH");
  const chainId = await client.getChainId();
  assert(chainId === SEPOLIA_CHAIN_ID, "sepolia rpc chainId != 11155111");

  const tx = await withTransportRetry(
    () => client.getTransaction({ hash: claimedTxHash as `0x${string}` }),
    "sepolia tx lookup",
  );
  assert(tx !== null, "sepolia tx not found");
  assert(tx.typeHex === "0x2", "sepolia tx type != 2");
  assert(
    Number(tx.chainId) === SEPOLIA_CHAIN_ID,
    "sepolia tx chainId != 11155111",
  );
  assert(tx.blockNumber !== null, "sepolia tx not mined");
  assert(
    tx.accessList === undefined || tx.accessList.length === 0,
    "sepolia tx accessList not empty",
  );
  assert(typeof tx.from === "string", "sepolia tx sender unavailable");
  // Hosted free-tier providers rate-limit adjacent reads; retry with backoff
  // is read-only transport behavior (never a finality/reorg policy).
  const receipt = await withTransportRetry(
    () =>
      client.getTransactionReceipt({ hash: claimedTxHash as `0x${string}` }),
    "sepolia receipt lookup",
  );
  assert(receipt.status === "success", "sepolia receipt status != 1");
  console.log("M05_IG01_SEPOLIA_TYPE2=PASS");
}

// ---------------------------------------------------------------------------
// Proof Builder (untrusted transport) → exact normalized payload
// ---------------------------------------------------------------------------

async function obtainNormalizedProof(): Promise<{
  payload: ReturnType<typeof normalizeAttestcoinProof> extends {
    kind: "NORMALIZED";
    payload: infer P;
  }
    ? P
    : never;
  raw: unknown;
}> {
  // 30s transport timeout: live proof generation with 610 continuity roots
  // measured ~3.4s but jittering near the 5s default under network load.
  const builder = createProofBuilderClient(
    requiredEnv("ATTESTCOIN_PROOF_BUILDER_URL"),
    fetch,
    30_000,
  );
  const claimedTxHash = requiredEnv("M05_IG01_SEPOLIA_TX_HASH");
  const outcome = await builder.requestProof(claimedTxHash);
  if (outcome.kind === "PROOF_RECEIVED") {
    const normalized = normalizeAttestcoinProof(outcome.raw);
    if (normalized.kind === "NORMALIZED") {
      console.log("M05_IG01_PROOF_BUILDER=PASS");
      return { payload: normalized.payload, raw: outcome.raw };
    }
    fail(`proof normalization rejected: ${normalized.error}`);
  }
  fail(`proof builder outcome: ${outcome.kind}`);
}

// ---------------------------------------------------------------------------
// Independent TS Monster oracle from the transport bytes (never the Factory
// output). ethers is TEST ONLY (tech-stack §8.2) — used here exactly like the
// M03 SIG-01 fixtures, as an independent ABI decode reference.
// ---------------------------------------------------------------------------

const USC_CHUNKS_ABI = ["uint8", "bytes[]"] as const;

function decodeTransportWithEthers(encodedTransaction: string) {
  const [type, chunks] = AbiCoder.defaultAbiCoder().decode(
    USC_CHUNKS_ABI,
    encodedTransaction,
  );
  if (type !== 2n) fail("transport txType != 2");
  if (chunks.length !== 3) fail("transport chunk count != 3");
  return chunks as unknown as string[];
}

function tsOracleFromTransport(
  encodedTransaction: string,
  blockHeight: string,
  transactionIndex: string,
) {
  const chunks = decodeTransportWithEthers(encodedTransaction);
  const [nonce, gasLimit, from, toIsNull, to, value, data] =
    AbiCoder.defaultAbiCoder().decode(
      ["uint64", "uint64", "address", "bool", "address", "uint256", "bytes"],
      chunks[0],
    ) as unknown as [bigint, bigint, string, boolean, string, bigint, string];
  // bytes32 fields decode as 0x hex strings via ethers; convert to bigint for
  // the canonical Type-2 reconstruction.
  const [chainId, maxPriorityFeePerGas, maxFeePerGas, , yParity, rHex, sHex] =
    AbiCoder.defaultAbiCoder().decode(
      [
        "uint64",
        "uint128",
        "uint128",
        "(address,bytes32[])[]",
        "uint8",
        "bytes32",
        "bytes32",
      ],
      chunks[1],
    ) as unknown as [bigint, bigint, bigint, unknown[], bigint, string, string];
  const [receiptStatus, , logTuples] = AbiCoder.defaultAbiCoder().decode(
    ["uint8", "uint64", "(address,bytes32[],bytes)[]", "bytes"],
    chunks[2],
  ) as unknown as [number, bigint, Array<[string, string[], string]>, string];

  const transaction: Type2TransactionV1 = {
    txType: 2,
    chainId,
    nonce,
    maxPriorityFeePerGas,
    maxFeePerGas,
    gasLimit,
    to: toIsNull ? null : (to.toLowerCase() as `0x${string}`),
    value,
    input: data,
    accessList: [],
    yParity: (yParity === 1n || yParity === 1 ? 1 : 0) as 0 | 1,
    r: BigInt(rHex),
    s: BigInt(sHex),
  };

  // Canonical sourceTx reconstruction (independent of the Factory).
  const sourceTx = deriveCanonicalSourceTxV1(transaction);

  // Classifier inputs from the transport receipt chunk.
  const logs: ClassifierLogV1[] = logTuples.map(
    ([address_, topics, data_]) => ({
      address: address_.toLowerCase(),
      topics: topics.map((t) => t.toLowerCase()),
      data: data_,
    }),
  );
  const activityClass = classifyTransactionV1({
    sourceActor: from.toLowerCase() as `0x${string}`,
    hasTo: !toIsNull,
    value,
    input: data,
    logs,
  });
  const dna = deriveTransactionDnaV1({
    activityClass,
    blockHeight: BigInt(blockHeight),
    transactionIndex: BigInt(transactionIndex),
  });
  const generated = generateMonsterV1(dna.transactionDNA);
  const resolved = resolveMonsterV1(generated, sourceTx);
  return {
    sourceTx,
    transaction,
    receiptStatus,
    claimantFromTransport: (from as string).toLowerCase(),
    monster: resolved,
    activityClass,
  };
}

// ---------------------------------------------------------------------------
// Temporary deployment (only in --deploy-and-verify mode)
// ---------------------------------------------------------------------------

async function deployTemporaryIntegration(): Promise<IntegrationManifest> {
  if (existsSync(MANIFEST_PATH)) {
    throw new Error(
      "integration manifest already exists — rerun with --verify-existing or remove the old manifest explicitly",
    );
  }
  const rpcUrl = requiredEnv("CREDITCOIN_RPC_URL");
  const privateKey = requiredEnv("M05_INTEGRATION_DEPLOYER_PRIVATE_KEY");
  const signer = requiredEnv(
    "M05_INTEGRATION_ASSET_APPROVAL_SIGNER",
  ).toLowerCase();
  const genesis = BigInt(requiredEnv("M05_INTEGRATION_CAPTURE_GENESIS_BLOCK"));

  const client = createCreditcoinPublicClient(rpcUrl);
  const chainId = await client.getChainId();
  assert(chainId === CREDITCOIN_CHAIN_ID, "creditcoin rpc chainId != 102031");

  // Local signing account: viem wallet clients do NOT rely on node-managed
  // signers; the account object makes deployContract sign client-side.
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const deployer = account.address.toLowerCase() as Address;

  const wallet = createWalletClient({
    account,
    chain: { id: CREDITCOIN_CHAIN_ID } as never,
    transport: http(rpcUrl),
  }).extend(publicActions);

  const nonce = await wallet.getTransactionCount({ address: deployer });
  // viem's CREATE-address precomputation takes `from` + nonce (CWI-08 mirror
  // of vm.computeCreateAddress).
  const predictedNFT = getContractAddress({ from: deployer, nonce });
  const predictedFactory = getContractAddress({
    from: deployer,
    nonce: nonce + 1,
  });
  const predictedMarketplace = getContractAddress({
    from: deployer,
    nonce: nonce + 2,
  });
  console.log(`deployment: deployer=${deployer} nonce=${nonce}`);
  console.log(`deployment: predictedNFT=${predictedNFT}`);
  console.log(`deployment: predictedFactory=${predictedFactory}`);
  console.log(`deployment: predictedMarketplace=${predictedMarketplace}`);

  // Deploy in the exact canonical order (NFT → Factory → Marketplace) with the
  // predicted-address precomputation from CWI-08, mirroring
  // DeployOriginDuel.s.sol semantics via the viem bytecode deployment path.
  // The Factory bytecode comes from the Section 11.6-H temporary build-profile
  // probe (P3: optimizer=true runs=200 viaIR=true), used transiently for this
  // Gate-F integration deployment only — never persisted as a release default.
  const probeArtifactDir = process.env.M05_PROBE_ARTIFACT_DIR;
  const artifactFrom = (dir: string) => (name: string) =>
    JSON.parse(
      readFileSync(resolve(dir, name, `${name.split(".")[0]}.json`), "utf8"),
    );
  const probeArtifacts = probeArtifactDir
    ? artifactFrom(probeArtifactDir)
    : null;
  const artifacts = (name: string) =>
    JSON.parse(
      readFileSync(
        resolve(REPO_ROOT, "contracts/out", name, `${name.split(".")[0]}.json`),
        "utf8",
      ),
    );
  const hexOf = (object: string) =>
    (object.startsWith("0x") ? object : `0x${object}`) as `0x${string}`;

  const factoryArtifact = probeArtifacts
    ? probeArtifacts("MonsterFactoryASC.sol")
    : artifacts("MonsterFactoryASC.sol");
  const factoryBytecodeBytes =
    (factoryArtifact.deployedBytecode.object.length - 2) / 2;
  assert(
    factoryBytecodeBytes <= 24_576,
    `probe Factory bytecode ${factoryBytecodeBytes} > EIP-170 24576`,
  );
  console.log(
    `deployment: factory runtime bytecode = ${factoryBytecodeBytes} bytes (P3 temporary profile)`,
  );

  const nftHash = await wallet.deployContract({
    abi: MONSTERNFT_ABI,
    bytecode: hexOf(artifacts("MonsterNFT.sol").bytecode.object),
    args: [predictedFactory, "Origin Duel Monster", "ODM"],
  });
  const nftReceipt = await wallet.waitForTransactionReceipt({ hash: nftHash });
  const actualNFT = nftReceipt.contractAddress as Address;
  assert(
    actualNFT.toLowerCase() === predictedNFT.toLowerCase(),
    "NFT predicted/actual mismatch",
  );
  console.log(`deployment: nft=${actualNFT} tx=${nftHash}`);

  const factoryHash = await wallet.deployContract({
    abi: MONSTERFACTORYASC_ABI,
    bytecode: hexOf(factoryArtifact.bytecode.object),
    args: [actualNFT, signer, BLOCK_PROVER, genesis],
  });
  const factoryReceipt = await wallet.waitForTransactionReceipt({
    hash: factoryHash,
  });
  const actualFactory = factoryReceipt.contractAddress as Address;
  assert(
    actualFactory.toLowerCase() === predictedFactory.toLowerCase(),
    "Factory predicted/actual mismatch",
  );
  console.log(`deployment: factory=${actualFactory} tx=${factoryHash}`);

  const marketHash = await wallet.deployContract({
    abi: MONSTERMARKETPLACE_ABI,
    bytecode: hexOf(artifacts("MonsterMarketplace.sol").bytecode.object),
    args: [actualNFT],
  });
  const marketReceipt = await wallet.waitForTransactionReceipt({
    hash: marketHash,
  });
  const actualMarketplace = marketReceipt.contractAddress as Address;
  assert(
    actualMarketplace.toLowerCase() === predictedMarketplace.toLowerCase(),
    "Marketplace predicted/actual mismatch",
  );
  console.log(`deployment: marketplace=${actualMarketplace} tx=${marketHash}`);

  // Immutable binding assertions.
  const nftView = getContract({
    address: actualNFT,
    abi: MONSTERNFT_ABI,
    client,
  });
  const mkView = getContract({
    address: actualMarketplace,
    abi: MONSTERMARKETPLACE_ABI,
    client,
  });
  assert(
    (await nftView.read.factory()).toLowerCase() ===
      actualFactory.toLowerCase(),
    "NFT factory binding mismatch",
  );
  const factoryView = getContract({
    address: actualFactory,
    abi: MONSTERFACTORYASC_ABI,
    client,
  });
  assert(
    (await factoryView.read.monsterNFT()).toLowerCase() ===
      actualNFT.toLowerCase(),
    "Factory NFT binding mismatch",
  );
  assert(
    (await mkView.read.nft()).toLowerCase() === actualNFT.toLowerCase(),
    "Marketplace NFT binding mismatch",
  );

  const manifest: IntegrationManifest = {
    schema: "origin-duel-integration-manifest-v1",
    purpose: "INTEGRATION_TEST_DEPLOYMENT",
    chainId: CREDITCOIN_CHAIN_ID,
    deployer,
    startingNonce: String(nonce),
    predictedNFT: predictedNFT.toLowerCase(),
    predictedFactory: predictedFactory.toLowerCase(),
    predictedMarketplace: predictedMarketplace.toLowerCase(),
    actualNFT: actualNFT.toLowerCase(),
    actualFactory: actualFactory.toLowerCase(),
    actualMarketplace: actualMarketplace.toLowerCase(),
    assetApprovalSigner: signer,
    captureGenesisBlock: String(genesis),
    blockProver: BLOCK_PROVER,
    // Section 11.6-H temporary build-profile probe evidence: integration-only,
    // never a release default and never Gate B PASS.
    temporaryBuildProfile: {
      purpose: "M05_GATE_F_TEMPORARY_ONLY",
      optimizer: true,
      optimizerRuns: 200,
      viaIR: true,
      solc: "0.8.36",
      evmVersion: "shanghai",
      monsterFactoryDeployedBytecodeBytes: factoryBytecodeBytes,
      eip170LimitBytes: 24_576,
    },
    deploymentTxHashes: [nftHash, factoryHash, marketHash],
    sourceTxHash: requiredEnv("M05_IG01_SEPOLIA_TX_HASH"),
    createdAt: new Date().toISOString(),
  };
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log("M05_IG01_TEMP_DEPLOYMENT=PASS");
  return manifest;
}

function loadManifest(): IntegrationManifest {
  if (!existsSync(MANIFEST_PATH)) fail("integration manifest not found");
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

// ---------------------------------------------------------------------------
// Factory canonical preflight + parity
// ---------------------------------------------------------------------------

async function runPreflightAndParity(
  manifest: IntegrationManifest,
): Promise<void> {
  const client = createCreditcoinPublicClient(
    requiredEnv("CREDITCOIN_RPC_URL"),
  );
  const chainId = await client.getChainId();
  assert(chainId === CREDITCOIN_CHAIN_ID, "creditcoin rpc chainId != 102031");
  assert(manifest.blockProver === BLOCK_PROVER, "manifest Block Prover drift");

  const { payload } = await obtainNormalizedProof();

  // The preflight claimant is the DIRECT_TX_SENDER of the source transaction.
  const sepolia = createSepoliaPublicClient(requiredEnv("SEPOLIA_RPC_URL"));
  const claimedTxHash = requiredEnv("M05_IG01_SEPOLIA_TX_HASH");
  const tx = await withTransportRetry(
    () => sepolia.getTransaction({ hash: claimedTxHash as `0x${string}` }),
    "sepolia tx lookup (claimant)",
  );
  const claimant = (tx.from as string).toLowerCase();

  const preflight = await readFactoryPreflight(
    client,
    manifest.actualFactory,
    claimedTxHash,
    claimant,
    payload,
  );
  if (preflight.kind === "CONTRACT_REVERT") {
    fail(`factory preflight revert: ${preflight.reason}`);
  }
  if (preflight.kind === "READ_FAILED") {
    fail(
      `factory preflight read failed: ${preflight.errorKind} ${preflight.cause.slice(0, 300)}`,
    );
  }
  if (preflight.kind !== "READ") fail("unexpected preflight outcome");
  console.log("M05_IG01_BLOCK_PROVER_FACTORY_PREFLIGHT=PASS");

  // Exact sourceTx parity: Factory-derived canonical sourceTx must equal the
  // claimed hash (the Factory already binds it internally) and the independent
  // TS reconstruction.
  const factorySourceTx = preflight.result.monster.sourceTx.toLowerCase();
  assert(
    factorySourceTx === claimedTxHash.toLowerCase(),
    "Factory sourceTx != claimed tx hash",
  );
  const tsOracle = tsOracleFromTransport(
    payload.encodedTransaction,
    payload.blockHeight,
    // transactionIndex is Block-Prover-derived inside the Factory; the TS
    // oracle recomputes it from the same merkle proof siblings deterministically
    // is NOT available off-chain, so the harness reads it from the transport's
    // on-chain index? The preflight does not return it. Instead: recompute the
    // merkle index from siblings (the pinned calculateTxIndex semantics).
    txIndexFromSiblings(payload.siblings),
  );
  assert(
    tsOracle.sourceTx.toLowerCase() === claimedTxHash.toLowerCase(),
    "TS sourceTx reconstruction != claimed tx hash",
  );
  console.log("M05_IG01_SOURCE_TX_PARITY=PASS");

  // Deterministic Monster parity: every frozen field.
  const factoryMonster = preflight.result.monster;
  assert(
    BigInt(factoryMonster.speciesId) === BigInt(tsOracle.monster.speciesId) &&
      BigInt(factoryMonster.level) === BigInt(tsOracle.monster.level) &&
      BigInt(factoryMonster.atk) === BigInt(tsOracle.monster.atk) &&
      BigInt(factoryMonster.def) === BigInt(tsOracle.monster.def) &&
      BigInt(factoryMonster.element) ===
        BigInt(elementToIndex(tsOracle.monster.element)) &&
      BigInt(factoryMonster.rarity) ===
        BigInt(rarityToIndex(tsOracle.monster.rarity)) &&
      factoryMonster.transactionDNA.toLowerCase() ===
        tsOracle.monster.transactionDNA.toLowerCase(),
    "Monster parity mismatch between Factory and independent TS oracle",
  );
  console.log("M05_IG01_MONSTER_PARITY=PASS");
}

/**
 * Mirrors the Block Prover calculateTxIndex semantics, verified against a live
 * proof: a LEFT sibling sits on the left of the current leaf, so the leaf's
 * bit is 1 (right branch); a RIGHT sibling means the leaf's bit is 0. Bits
 * accumulate MSB-first. (Live check: siblings [False,True,False] → 2, matching
 * the receipt's transactionIndex 2.)
 */
function txIndexFromSiblings(siblings: Array<{ isLeft: boolean }>): string {
  let index = 0n;
  for (const sibling of siblings) {
    index = index * 2n + (sibling.isLeft ? 1n : 0n);
  }
  return index.toString(10);
}

function elementToIndex(element: string): number {
  return element === "FIRE" ? 0 : element === "WATER" ? 1 : 2;
}

function rarityToIndex(rarity: string): number {
  return ["COMMON", "RARE", "EPIC", "LEGENDARY"].indexOf(rarity);
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "--verify-existing";
  if (mode !== "--deploy-and-verify" && mode !== "--verify-existing") {
    fail(`unsupported mode ${mode}`);
  }

  // 1. Sepolia frozen-profile gate.
  await assertSepoliaType2Profile();

  let manifest: IntegrationManifest;
  if (mode === "--deploy-and-verify") {
    manifest = await deployTemporaryIntegration();
  } else {
    manifest = loadManifest();
  }

  // 2. Proof → preflight → exact sourceTx → deterministic Monster parity.
  await runPreflightAndParity(manifest);

  console.log("M05_T04_GATE_F_EVIDENCE=PASS");
}

await main();
