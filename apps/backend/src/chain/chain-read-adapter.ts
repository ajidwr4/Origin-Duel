import {
  MONSTERFACTORYASC_ABI,
  MONSTERMARKETPLACE_ABI,
  MONSTERNFT_ABI,
} from "@origin-duel/contracts-abi";
import type {
  AttestcoinProofPayloadV1,
  Bytes32HexV1,
} from "@origin-duel/domain";
import { readContract } from "viem/actions";
import type { CreditcoinPublicClient, SepoliaPublicClient } from "./clients.ts";
import {
  getMonsterFactory,
  getMonsterMarketplace,
  getMonsterNft,
} from "./contracts.ts";
import { bigintValueToJson, normalizeWalletAddress } from "./normalize.ts";
import { readSepoliaAdvisory } from "./sepolia-advisory.ts";

/**
 * Chain Read Adapter (Phase 9 §17 — M05 reusable subset only). Normalized
 * read/transport boundary over the generated contract ABIs. The contracts are
 * the read truth: a successful adapter call is exactly what the contract
 * view returned — this adapter never invents, upgrades, or rejects chain
 * state on its own.
 */

/** Normalized provider failure classes, distinct from contract reverts. */
export type ChainReadErrorKind =
  | "RPC_UNAVAILABLE" // transport could not answer (timeout/network/stale)
  | "MALFORMED_PROVIDER_PAYLOAD"; // provider answered, payload failed decoding

export type ChainReadOutcome<T> =
  | { kind: "READ"; value: T }
  | { kind: "READ_FAILED"; errorKind: ChainReadErrorKind; cause: string };

/** Deterministic contract revert (the contract, not the provider, said no). */
export type ContractRevert = { kind: "CONTRACT_REVERT"; reason: string };

function classifyReadError(error: unknown): ChainReadErrorKind {
  if (
    errorChainHasName(
      error,
      ["HttpRequestError", "TimeoutError", "SocketError", "TypeError"],
      6,
    )
  ) {
    return "RPC_UNAVAILABLE";
  }
  // DecodingError / InvalidResponse etc: the provider answered, but the
  // payload is not a valid shape — malformed, not authoritative.
  return "MALFORMED_PROVIDER_PAYLOAD";
}

/** True when the error (or any cause) carries one of the given names. */
function errorChainHasName(
  error: unknown,
  names: string[],
  depth = 0,
): boolean {
  let current: unknown = error;
  for (
    let i = 0;
    i <= depth && current !== undefined && current !== null;
    i += 1
  ) {
    const name = (current as { name?: string }).name;
    if (typeof name === "string" && names.includes(name)) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function readChain<T>(
  run: () => Promise<T>,
): Promise<ChainReadOutcome<T> | ContractRevert> {
  try {
    return { kind: "READ", value: await run() };
  } catch (error) {
    const name = (error as { name?: string } | undefined)?.name;
    if (name === "ContractFunctionExecutionError") {
      // viem wraps provider transport failures inside this same error type
      // (cause chain carries HttpRequestError/CallExecutionError). Only a
      // revert with a genuine execution cause is contract-authored truth;
      // transport noise deeper in the chain stays retryable-unavailable.
      if (
        errorChainHasName(
          error,
          ["HttpRequestError", "TimeoutError", "SocketError"],
          4,
        )
      ) {
        return {
          kind: "READ_FAILED",
          errorKind: "RPC_UNAVAILABLE",
          cause: String(error),
        };
      }
      return {
        kind: "CONTRACT_REVERT",
        reason:
          (error as { shortMessage?: string }).shortMessage ?? String(error),
      };
    }
    return {
      kind: "READ_FAILED",
      errorKind: classifyReadError(error),
      cause: String(error),
    };
  }
}

// ---------------------------------------------------------------------------
// Sepolia advisory
// ---------------------------------------------------------------------------

export type SepoliaAdvisoryOutcome = Awaited<
  ReturnType<typeof readSepoliaAdvisory>
>;
export { readSepoliaAdvisory };

export async function readSepoliaAdvisoryOperation(
  client: SepoliaPublicClient,
  claimedTxHash: Bytes32HexV1,
): Promise<SepoliaAdvisoryOutcome> {
  return readSepoliaAdvisory(client, claimedTxHash);
}

// ---------------------------------------------------------------------------
// Factory reads (Creditcoin) — canonical preflight / replay / cooldown
// ---------------------------------------------------------------------------

/** Normalized Factory EligibilityViewV1 (bigint internally, decimal JSON). */
export interface FactoryEligibilityViewV1 {
  consumedTokenPlusOne: string;
  cooldownEndsAt: string;
  replayUnused: boolean;
  cooldownReady: boolean;
}

export interface FactoryReplayViewV1 {
  sourceTx: Bytes32HexV1;
  consumedTokenPlusOne: string;
  /** replay is UNUSED when the contract reports tokenPlusOne == 0. */
  replayState: "UNUSED" | "CONSUMED";
}

/** readReplayAndCooldown: replay state + cooldown window for a claimant. */
export async function readReplayAndCooldown(
  client: CreditcoinPublicClient,
  factoryAddress: string,
  claimant: string,
  sourceTx: Bytes32HexV1,
): Promise<
  | {
      kind: "READ";
      view: FactoryReplayViewV1 & {
        eligibility: FactoryEligibilityViewV1;
      };
    }
  | { kind: "READ_FAILED"; errorKind: ChainReadErrorKind; cause: string }
  | ContractRevert
> {
  const claimantAddress = normalizeWalletAddress(claimant);
  const replay = await readChain(() =>
    readContract(client, {
      address: factoryAddress as `0x${string}`,
      abi: MONSTERFACTORYASC_ABI,
      functionName: "lookupReplay",
      args: [sourceTx],
    }),
  );
  if (replay.kind !== "READ") {
    return replay;
  }
  const eligibility = await readChain(() =>
    readContract(client, {
      address: factoryAddress as `0x${string}`,
      abi: MONSTERFACTORYASC_ABI,
      functionName: "readEligibility",
      args: [claimantAddress, sourceTx],
    }),
  );
  if (eligibility.kind !== "READ") {
    return eligibility;
  }
  // viem action returns single outputs unwrapped (not tuples).
  const tokenPlusOne = replay.value as bigint;
  const eligibilityView = eligibility.value as {
    consumedTokenPlusOne: bigint;
    cooldownEndsAt: bigint;
    replayUnused: boolean;
    cooldownReady: boolean;
  };
  return {
    kind: "READ",
    view: {
      sourceTx,
      consumedTokenPlusOne: bigintValueToJson(tokenPlusOne),
      replayState: tokenPlusOne === 0n ? "UNUSED" : "CONSUMED",
      eligibility: {
        consumedTokenPlusOne: bigintValueToJson(
          eligibilityView.consumedTokenPlusOne,
        ),
        cooldownEndsAt: bigintValueToJson(eligibilityView.cooldownEndsAt),
        replayUnused: eligibilityView.replayUnused,
        cooldownReady: eligibilityView.cooldownReady,
      },
    },
  };
}

/** readFactoryPreflight: read-only Factory canonical preflight execution. */
export async function readFactoryPreflight(
  client: CreditcoinPublicClient,
  factoryAddress: string,
  claimedTxHash: Bytes32HexV1,
  claimant: string,
  proof: AttestcoinProofPayloadV1,
): Promise<
  | {
      kind: "READ";
      result: {
        monster: NormalizedMonsterViewV1;
        eligibility: FactoryEligibilityViewV1;
      };
    }
  | { kind: "READ_FAILED"; errorKind: ChainReadErrorKind; cause: string }
  | ContractRevert
> {
  const outcome = await readChain(async () => {
    const raw = (await readContract(client, {
      address: factoryAddress as `0x${string}`,
      abi: MONSTERFACTORYASC_ABI,
      functionName: "canonicalPreflight",
      args: [
        claimedTxHash,
        {
          chainKey: BigInt(proof.chainKey),
          blockHeight: BigInt(proof.blockHeight),
          encodedTransaction: proof.encodedTransaction,
          merkleRoot: proof.merkleRoot,
          siblings: proof.siblings.map((s) => ({
            hash: s.hash,
            isLeft: s.isLeft,
          })),
          lowerEndpointDigest: proof.lowerEndpointDigest,
          continuityRoots: proof.continuityRoots,
        },
        normalizeWalletAddress(claimant),
      ],
    })) as {
      monster: {
        speciesId: number;
        level: number;
        atk: number;
        def: number;
        element: number;
        rarity: number;
        transactionDNA: `0x${string}`;
        sourceTx: `0x${string}`;
      };
      eligibility: {
        consumedTokenPlusOne: bigint;
        cooldownEndsAt: bigint;
        replayUnused: boolean;
        cooldownReady: boolean;
      };
    };
    const preflight = raw;
    return {
      monster: {
        speciesId: preflight.monster.speciesId,
        level: preflight.monster.level,
        atk: preflight.monster.atk,
        def: preflight.monster.def,
        element: preflight.monster.element,
        rarity: preflight.monster.rarity,
        transactionDNA: preflight.monster.transactionDNA as Bytes32HexV1,
        sourceTx: preflight.monster.sourceTx as Bytes32HexV1,
      } satisfies NormalizedMonsterViewV1,
      eligibility: {
        consumedTokenPlusOne: bigintValueToJson(
          preflight.eligibility.consumedTokenPlusOne,
        ),
        cooldownEndsAt: bigintValueToJson(preflight.eligibility.cooldownEndsAt),
        replayUnused: preflight.eligibility.replayUnused,
        cooldownReady: preflight.eligibility.cooldownReady,
      } satisfies FactoryEligibilityViewV1,
    };
  });
  return outcome.kind === "READ"
    ? { kind: "READ", result: outcome.value }
    : outcome;
}

// ---------------------------------------------------------------------------
// NFT token state reads (Creditcoin)
// ---------------------------------------------------------------------------

/** Normalized NFT Monster view: uint256 fields stay decimal strings. */
export interface NormalizedMonsterViewV1 {
  speciesId: number;
  level: number;
  atk: number;
  def: number;
  element: number;
  rarity: number;
  transactionDNA: Bytes32HexV1;
  sourceTx: Bytes32HexV1;
}

export interface TokenStateViewV1 {
  tokenId: string;
  owner: string;
  tokenUri: string;
  monster: NormalizedMonsterViewV1;
}

export type TokenReadOutcome =
  | { kind: "READ"; view: TokenStateViewV1 }
  | { kind: "READ_FAILED"; errorKind: ChainReadErrorKind; cause: string }
  | { kind: "TOKEN_NOT_OWNED_STATE"; reason: string }
  | ContractRevert;

/** readTokenState: owner/Monster/tokenURI/sourceTx for a known tokenId. */
export async function readTokenState(
  client: CreditcoinPublicClient,
  nftAddress: string,
  tokenId: bigint,
): Promise<TokenReadOutcome> {
  const address = nftAddress as `0x${string}`;
  const owner = await readChain(() =>
    readContract(client, {
      address,
      abi: MONSTERNFT_ABI,
      functionName: "ownerOf",
      args: [tokenId],
    }),
  );
  if (owner.kind !== "READ") {
    return owner;
  }
  const monster = await readChain(() =>
    readContract(client, {
      address,
      abi: MONSTERNFT_ABI,
      functionName: "monsterOf",
      args: [tokenId],
    }),
  );
  if (monster.kind !== "READ") {
    return monster;
  }
  const uri = await readChain(() =>
    readContract(client, {
      address,
      abi: MONSTERNFT_ABI,
      functionName: "tokenURI",
      args: [tokenId],
    }),
  );
  if (uri.kind !== "READ") {
    return uri;
  }
  const m = monster.value as NormalizedMonsterViewV1;
  return {
    kind: "READ",
    view: {
      tokenId: bigintValueToJson(tokenId),
      owner: normalizeWalletAddress(owner.value as string),
      tokenUri: uri.value as string,
      monster: {
        speciesId: m.speciesId,
        level: m.level,
        atk: m.atk,
        def: m.def,
        element: m.element,
        rarity: m.rarity,
        transactionDNA: m.transactionDNA as Bytes32HexV1,
        sourceTx: m.sourceTx as Bytes32HexV1,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Marketplace read (Creditcoin)
// ---------------------------------------------------------------------------

/** Normalized Marketplace listing view for one tokenId. */
export interface ListingViewV1 {
  tokenId: string;
  seller: string;
  price: string;
  exists: boolean;
  executable: boolean;
}

export type ListingReadOutcome =
  | { kind: "READ"; listing: ListingViewV1 }
  | { kind: "READ_FAILED"; errorKind: ChainReadErrorKind; cause: string }
  | ContractRevert;

/** readMarketplace: one listing view for a known tokenId. */
export async function readMarketplace(
  client: CreditcoinPublicClient,
  marketplaceAddress: string,
  tokenId: bigint,
): Promise<ListingReadOutcome> {
  const outcome = await readChain(() =>
    readContract(client, {
      address: marketplaceAddress as `0x${string}`,
      abi: MONSTERMARKETPLACE_ABI,
      functionName: "listingOf",
      args: [tokenId],
    }),
  );
  if (outcome.kind !== "READ") {
    return outcome;
  }
  const listing = outcome.value as {
    seller: string;
    price: bigint;
    exists: boolean;
    executable: boolean;
  };
  return {
    kind: "READ",
    listing: {
      tokenId: bigintValueToJson(tokenId),
      seller: listing.exists
        ? normalizeWalletAddress(listing.seller)
        : listing.seller,
      price: bigintValueToJson(listing.price),
      exists: listing.exists,
      executable: listing.executable,
    },
  };
}

// keep the getContract helpers referenced so the typed-boundary remains part
// of this module's public surface alongside the readContract operations.
export { getMonsterFactory, getMonsterMarketplace, getMonsterNft };
