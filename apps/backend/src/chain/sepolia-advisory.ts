import type { SepoliaAdvisoryV1 } from "@origin-duel/domain";
import type { SepoliaPublicClient } from "./clients.ts";
import {
  bigintValueToJson,
  normalizeUint64Decimal,
  normalizeWalletAddress,
} from "./normalize.ts";

/**
 * Sepolia advisory lookup (Phase 8 §9, Phase 10 §57). This is advisory
 * transport only — NEVER AcceptedOriginV1 authority. A found/mined/pending
 * observation is a candidate classification hint; not-found and provider
 * failures are transport conditions, not cryptographic rejection or
 * non-inclusion proof.
 */

/** Transport-level conditions that are retryable/unavailable, never rejection. */
export type SepoliaAdvisoryLookupStatus =
  | "FOUND_MINED"
  | "FOUND_PENDING"
  | "NOT_FOUND"
  | "RPC_UNAVAILABLE";

export type SepoliaAdvisoryOutcome =
  | { kind: "ADVISORY"; advisory: SepoliaAdvisoryV1 }
  | { kind: "RPC_UNAVAILABLE"; cause: string };

function isProviderUnavailable(error: unknown): boolean {
  // Transport could not answer: viem HttpRequestError/TimeoutError/SocketError,
  // or a Node fetch TypeError ("fetch failed") in the cause chain.
  // TransactionNotFoundError is a definitive provider answer (not present),
  // so it is NOT routed here — it is a real NOT_FOUND observation.
  let current: unknown = error;
  for (
    let depth = 0;
    depth < 5 && current !== undefined && current !== null;
    depth += 1
  ) {
    const name = (current as { name?: string }).name;
    if (
      name === "HttpRequestError" ||
      name === "TimeoutError" ||
      name === "SocketError" ||
      name === "TypeError"
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Looks up the claimed Sepolia transaction and normalizes the observation to
 * canonical SepoliaAdvisoryV1. Provider timeouts/network failures surface as
 * a distinct retryable condition; they never become authoritative rejection.
 */
export async function readSepoliaAdvisory(
  client: SepoliaPublicClient,
  claimedTxHash: `0x${string}`,
): Promise<SepoliaAdvisoryOutcome> {
  return normalizeSepoliaAdvisory(client, claimedTxHash).catch(
    (error: unknown): SepoliaAdvisoryOutcome => {
      // Malformed provider payload: viem's decode (or the domain
      // normalization below) refused what the provider said. That is a
      // transport condition about the provider, never authoritative
      // rejection of the claimed transaction.
      return { kind: "RPC_UNAVAILABLE", cause: String(error) };
    },
  );
}

async function normalizeSepoliaAdvisory(
  client: SepoliaPublicClient,
  claimedTxHash: `0x${string}`,
): Promise<SepoliaAdvisoryOutcome> {
  let transaction: Awaited<ReturnType<SepoliaPublicClient["getTransaction"]>>;
  try {
    transaction = await client.getTransaction({ hash: claimedTxHash });
  } catch (error) {
    if (isProviderUnavailable(error)) {
      return { kind: "RPC_UNAVAILABLE", cause: String(error) };
    }
    if (
      (error as { name?: string } | undefined)?.name ===
      "TransactionNotFoundError"
    ) {
      return {
        kind: "ADVISORY",
        advisory: { lookupStatus: "NOT_FOUND", claimedTxHash },
      };
    }
    // Malformed provider payload (decode failure) — a transport condition
    // about what the provider said, not about the transaction itself.
    return { kind: "RPC_UNAVAILABLE", cause: String(error) };
  }

  const base = {
    claimedTxHash,
    sender: normalizeWalletAddress(transaction.from),
    // Map viem's named types onto the canonical numeric txType: legacy=0,
    // eip2930=1, eip1559=2 (EIP-2718 type envelope). Unknown types stay
    // advisory hints — the Factory, not this adapter, owns profile truth.
    txType:
      transaction.typeHex === "0x0"
        ? 0
        : transaction.typeHex === "0x1"
          ? 1
          : transaction.typeHex === "0x2"
            ? 2
            : Number.parseInt(transaction.typeHex ?? "0", 16),
  };

  if (transaction.blockNumber === null) {
    // Pending: known to the node, not yet in a block.
    return {
      kind: "ADVISORY",
      advisory: {
        lookupStatus: "FOUND_PENDING",
        ...base,
        chainId: bigintValueToJson(transaction.chainId ?? 0n),
        nonce: bigintValueToJson(transaction.nonce),
      },
    };
  }

  // Mined: read the receipt for status/type advisory hints.
  let receiptStatus: 0 | 1 | undefined;
  let transactionIndex: string | undefined;
  try {
    const receipt = await client.getTransactionReceipt({ hash: claimedTxHash });
    receiptStatus = receipt.status === "success" ? 1 : 0;
    if (receipt.transactionIndex !== undefined) {
      transactionIndex = bigintValueToJson(receipt.transactionIndex);
    }
  } catch (error) {
    if (isProviderUnavailable(error)) {
      return { kind: "RPC_UNAVAILABLE", cause: String(error) };
    }
    // Receipt missing after a mined blockNumber is a stale/inconsistent
    // provider observation — keep it advisory, never authoritative.
    receiptStatus = undefined;
  }

  return {
    kind: "ADVISORY",
    advisory: {
      lookupStatus: "FOUND_MINED",
      ...base,
      chainId: bigintValueToJson(transaction.chainId ?? 0n),
      blockHeight: normalizeUint64Decimal(
        bigintValueToJson(transaction.blockNumber),
      ),
      nonce: bigintValueToJson(transaction.nonce),
      ...(transactionIndex !== undefined ? { transactionIndex } : undefined),
      ...(receiptStatus !== undefined ? { receiptStatus } : undefined),
      accessListLength:
        transaction.accessList === undefined
          ? 0
          : transaction.accessList.length,
    },
  };
}
