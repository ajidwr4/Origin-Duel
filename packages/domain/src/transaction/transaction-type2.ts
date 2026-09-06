import { SEPOLIA_CHAIN_ID } from "../constants/index.js";
import { UINT256_MAX, type WalletAddress } from "../primitives/index.js";
import type { SourceTxV1 } from "./index.js";
import {
  bytesToHex,
  concatBytes,
  type HexV1,
  hexToBytes,
  keccak256,
} from "./keccak.js";

export interface Type2TransactionV1 {
  readonly txType: 2;
  readonly chainId: bigint;
  readonly nonce: bigint;
  readonly maxPriorityFeePerGas: bigint;
  readonly maxFeePerGas: bigint;
  readonly gasLimit: bigint;
  readonly to: WalletAddress | null;
  readonly value: bigint;
  readonly input: HexV1;
  readonly accessList: readonly [];
  readonly yParity: 0 | 1;
  readonly r: bigint;
  readonly s: bigint;
}

function minimalUnsigned(value: bigint): Uint8Array {
  if (typeof value !== "bigint" || value < 0n || value > UINT256_MAX) {
    throw new RangeError("Type-2 integer out of uint256 range");
  }
  if (value === 0n) return new Uint8Array();
  let hex = value.toString(16);
  if (hex.length % 2 !== 0) hex = `0${hex}`;
  return hexToBytes(`0x${hex}`);
}

function encodeLength(length: number, offset: number): Uint8Array {
  if (length < 56) return Uint8Array.of(offset + length);
  const lengthBytes = minimalUnsigned(BigInt(length));
  return concatBytes(
    Uint8Array.of(offset + 55 + lengthBytes.length),
    lengthBytes,
  );
}

function encodeBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 1 && (bytes[0] ?? 0) < 0x80) return bytes;
  return concatBytes(encodeLength(bytes.length, 0x80), bytes);
}

function encodeList(items: readonly Uint8Array[]): Uint8Array {
  const payload = concatBytes(...items);
  return concatBytes(encodeLength(payload.length, 0xc0), payload);
}

function validateType2(transaction: Type2TransactionV1): void {
  if (transaction.txType !== 2) {
    throw new TypeError("unsupported transaction type");
  }
  if (transaction.chainId !== BigInt(SEPOLIA_CHAIN_ID)) {
    throw new TypeError("unsupported chainId");
  }
  if (transaction.accessList.length !== 0) {
    throw new TypeError("non-empty access list is unsupported");
  }
  if (transaction.yParity !== 0 && transaction.yParity !== 1) {
    throw new TypeError("invalid yParity");
  }
  if (transaction.to !== null && !/^0x[0-9a-f]{40}$/.test(transaction.to)) {
    throw new TypeError("invalid Type-2 destination");
  }
}

export function reconstructSignedType2V1(
  transaction: Type2TransactionV1,
): HexV1 {
  validateType2(transaction);
  const payload = encodeList([
    encodeBytes(minimalUnsigned(transaction.chainId)),
    encodeBytes(minimalUnsigned(transaction.nonce)),
    encodeBytes(minimalUnsigned(transaction.maxPriorityFeePerGas)),
    encodeBytes(minimalUnsigned(transaction.maxFeePerGas)),
    encodeBytes(minimalUnsigned(transaction.gasLimit)),
    encodeBytes(
      transaction.to === null ? new Uint8Array() : hexToBytes(transaction.to),
    ),
    encodeBytes(minimalUnsigned(transaction.value)),
    encodeBytes(hexToBytes(transaction.input)),
    Uint8Array.of(0xc0),
    encodeBytes(minimalUnsigned(BigInt(transaction.yParity))),
    encodeBytes(minimalUnsigned(transaction.r)),
    encodeBytes(minimalUnsigned(transaction.s)),
  ]);
  return bytesToHex(concatBytes(Uint8Array.of(0x02), payload));
}

export function deriveCanonicalSourceTxV1(
  transaction: Type2TransactionV1,
): SourceTxV1 {
  return keccak256(reconstructSignedType2V1(transaction)) as SourceTxV1;
}

export function bindCanonicalSourceTxV1(
  transaction: Type2TransactionV1,
  claimedTxHash: string,
): SourceTxV1 {
  if (!/^0x[0-9a-f]{64}$/.test(claimedTxHash)) {
    throw new TypeError("invalid claimedTxHash");
  }
  const derived = deriveCanonicalSourceTxV1(transaction);
  if (derived !== claimedTxHash) {
    throw new Error("canonical transaction hash mismatch");
  }
  return derived;
}
