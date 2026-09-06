import {
  type ActivityClassV1,
  DOMAIN_SAMPLE_PREFIX,
  GENERATION_SPEC_VERSION,
  TRANSACTION_DNA_ENTROPY_DOMAIN,
} from "../constants/index.js";
import { type Bytes32HexV1, UINT256_MAX } from "../primitives/index.js";
import type { NormalizedTxV1, TransactionDNAV1 } from "./index.js";
import { concatBytes, hexToBytes, keccak256 } from "./keccak.js";

const UINT64_MAX = (1n << 64n) - 1n;
const ENTROPY_MASK = (1n << 248n) - 1n;

function uint256Word(value: bigint): Uint8Array {
  if (typeof value !== "bigint" || value < 0n || value > UINT256_MAX) {
    throw new RangeError("uint256 out of range");
  }
  return hexToBytes(`0x${value.toString(16).padStart(64, "0")}`);
}

function bytes32Word(value: string): Uint8Array {
  if (!/^0x[0-9a-f]{64}$/.test(value)) throw new TypeError("invalid bytes32");
  return hexToBytes(value);
}

export function deriveTransactionDnaV1(normalized: NormalizedTxV1): {
  readonly entropyDigest: Bytes32HexV1;
  readonly entropyPayload: `0x${string}`;
  readonly transactionDNA: TransactionDNAV1;
  readonly entropySeed: Bytes32HexV1;
} {
  if (
    !Number.isInteger(normalized.activityClass) ||
    normalized.activityClass < 0 ||
    normalized.activityClass > 5
  ) {
    throw new RangeError("activityClass out of range");
  }
  if (normalized.blockHeight < 0n || normalized.blockHeight > UINT64_MAX) {
    throw new RangeError("blockHeight out of uint64 range");
  }
  const encoded = concatBytes(
    bytes32Word(TRANSACTION_DNA_ENTROPY_DOMAIN),
    uint256Word(BigInt(GENERATION_SPEC_VERSION)),
    uint256Word(normalized.blockHeight),
    uint256Word(normalized.transactionIndex),
  );
  const entropyDigest = keccak256(encoded);
  const payload = BigInt(entropyDigest) & ENTROPY_MASK;
  const dna = (BigInt(normalized.activityClass) << 248n) | payload;
  return {
    entropyDigest,
    entropyPayload: `0x${payload.toString(16).padStart(62, "0")}`,
    transactionDNA:
      `0x${dna.toString(16).padStart(64, "0")}` as TransactionDNAV1,
    entropySeed: `0x${payload.toString(16).padStart(64, "0")}` as Bytes32HexV1,
  };
}

export function activityClassFromDnaV1(
  transactionDNA: TransactionDNAV1,
): ActivityClassV1 {
  if (!/^0x[0-9a-f]{64}$/.test(transactionDNA)) {
    throw new TypeError("invalid TransactionDNA");
  }
  const value = Number(BigInt(transactionDNA) >> 248n);
  if (value < 0 || value > 5)
    throw new RangeError("activityClass out of range");
  return value as ActivityClassV1;
}

export function entropySeedFromDnaV1(
  transactionDNA: TransactionDNAV1,
): Bytes32HexV1 {
  activityClassFromDnaV1(transactionDNA);
  return `0x${(BigInt(transactionDNA) & ENTROPY_MASK)
    .toString(16)
    .padStart(64, "0")}` as Bytes32HexV1;
}

export function domainSampleV1(
  entropySeed: Bytes32HexV1,
  domainId: Bytes32HexV1,
  sampleIndex: bigint,
): Bytes32HexV1 {
  return keccak256(
    concatBytes(
      bytes32Word(DOMAIN_SAMPLE_PREFIX),
      uint256Word(BigInt(GENERATION_SPEC_VERSION)),
      bytes32Word(entropySeed),
      bytes32Word(domainId),
      uint256Word(sampleIndex),
    ),
  );
}
