import { z } from "zod";

export type WalletAddress = `0x${string}`;
export type Bytes32HexV1 = `0x${string}`;
export type TxHashV1 = Bytes32HexV1;

export type TokenIdV1 = bigint;
export type WeiAmountV1 = bigint;
export type TokenIdJsonV1 = string;
export type WeiAmountJsonV1 = string;

export type UuidV1 = string;
export type Rfc3339UtcV1 = string;
export type CIDTextV1 = string;
export type IPFSUriV1 = `ipfs://${string}`;

export const UINT256_MAX = (1n << 256n) - 1n;

const CANONICAL_WALLET_ADDRESS = /^0x[0-9a-f]{40}$/;
const EXTERNAL_WALLET_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const CANONICAL_BYTES32 = /^0x[0-9a-f]{64}$/;
const CANONICAL_UINT_DECIMAL = /^(0|[1-9][0-9]*)$/;
const CANONICAL_RFC3339_UTC =
  /^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$/;
const CANONICAL_CID_BASE32 = /^b[a-z2-7]+$/;
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

export const WalletAddressSchema = z
  .string()
  .regex(CANONICAL_WALLET_ADDRESS)
  .transform((value): WalletAddress => value as WalletAddress);

const ExternalWalletAddressSchema = z.string().regex(EXTERNAL_WALLET_ADDRESS);

export function parseWalletAddress(value: unknown): WalletAddress {
  return WalletAddressSchema.parse(value);
}

export function normalizeWalletAddress(value: unknown): WalletAddress {
  return WalletAddressSchema.parse(
    ExternalWalletAddressSchema.parse(value).toLowerCase(),
  );
}

export function serializeWalletAddress(value: WalletAddress): string {
  return WalletAddressSchema.parse(value);
}

export const Bytes32HexV1Schema = z
  .string()
  .regex(CANONICAL_BYTES32)
  .transform((value): Bytes32HexV1 => value as Bytes32HexV1);

export const TxHashV1Schema = Bytes32HexV1Schema;

export function parseBytes32HexV1(value: unknown): Bytes32HexV1 {
  return Bytes32HexV1Schema.parse(value);
}

export function serializeBytes32HexV1(value: Bytes32HexV1): string {
  return Bytes32HexV1Schema.parse(value);
}

export function parseTxHashV1(value: unknown): TxHashV1 {
  return TxHashV1Schema.parse(value);
}

export function serializeTxHashV1(value: TxHashV1): string {
  return TxHashV1Schema.parse(value);
}

function isUint256Decimal(value: string): boolean {
  return CANONICAL_UINT_DECIMAL.test(value) && BigInt(value) <= UINT256_MAX;
}

function serializeUint256(value: bigint): string {
  if (typeof value !== "bigint") {
    throw new TypeError("uint256 must be a bigint");
  }
  if (value < 0n || value > UINT256_MAX) {
    throw new RangeError("uint256 out of range");
  }
  return value.toString(10);
}

export const TokenIdV1Schema = z.bigint().min(0n).max(UINT256_MAX);
export const WeiAmountV1Schema = TokenIdV1Schema;

export const TokenIdJsonV1Schema = z
  .string()
  .refine(isUint256Decimal)
  .transform((value): TokenIdJsonV1 => value);

export const WeiAmountJsonV1Schema = z
  .string()
  .refine(isUint256Decimal)
  .transform((value): WeiAmountJsonV1 => value);

export function tokenIdFromJson(value: unknown): TokenIdV1 {
  return BigInt(TokenIdJsonV1Schema.parse(value));
}

export function tokenIdToJson(value: TokenIdV1): TokenIdJsonV1 {
  return serializeUint256(value);
}

export function weiAmountFromJson(value: unknown): WeiAmountV1 {
  return BigInt(WeiAmountJsonV1Schema.parse(value));
}

export function weiAmountToJson(value: WeiAmountV1): WeiAmountJsonV1 {
  return serializeUint256(value);
}

export const UuidV1Schema = z
  .uuid()
  .refine((value) => value === value.toLowerCase())
  .transform((value): UuidV1 => value);

export function parseUuidV1(value: unknown): UuidV1 {
  return UuidV1Schema.parse(value);
}

export function serializeUuidV1(value: UuidV1): string {
  return UuidV1Schema.parse(value);
}

function isCanonicalRfc3339Utc(value: string): boolean {
  if (!CANONICAL_RFC3339_UTC.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

export const Rfc3339UtcV1Schema = z
  .string()
  .refine(isCanonicalRfc3339Utc)
  .transform((value): Rfc3339UtcV1 => value);

export function parseRfc3339UtcV1(value: unknown): Rfc3339UtcV1 {
  return Rfc3339UtcV1Schema.parse(value);
}

export function rfc3339UtcV1FromDate(value: Date): Rfc3339UtcV1 {
  if (Number.isNaN(value.getTime())) {
    throw new RangeError("invalid date");
  }
  return Rfc3339UtcV1Schema.parse(value.toISOString());
}

export function serializeRfc3339UtcV1(value: Rfc3339UtcV1): string {
  return Rfc3339UtcV1Schema.parse(value);
}

function decodeBase32(value: string): Uint8Array | undefined {
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];

  for (const character of value) {
    const digit = BASE32_ALPHABET.indexOf(character);
    if (digit === -1) {
      return undefined;
    }
    buffer = (buffer << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }

  if (buffer !== 0) {
    return undefined;
  }
  return Uint8Array.from(bytes);
}

function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let buffer = 0;
  let encoded = "";

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += BASE32_ALPHABET[(buffer >> bits) & 0x1f];
      buffer &= (1 << bits) - 1;
    }
  }

  if (bits > 0) {
    encoded += BASE32_ALPHABET[(buffer << (5 - bits)) & 0x1f];
  }
  return encoded;
}

interface Varint {
  readonly value: bigint;
  readonly nextOffset: number;
}

function readCanonicalVarint(
  bytes: Uint8Array,
  offset: number,
): Varint | undefined {
  let value = 0n;
  let shift = 0n;

  for (let index = offset; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte === undefined) {
      return undefined;
    }
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      if (index > offset && byte === 0) {
        return undefined;
      }
      return { value, nextOffset: index + 1 };
    }
    shift += 7n;
  }
  return undefined;
}

function isCanonicalCidV1(value: string): boolean {
  if (!CANONICAL_CID_BASE32.test(value)) {
    return false;
  }
  const bytes = decodeBase32(value.slice(1));
  if (bytes === undefined || `b${encodeBase32(bytes)}` !== value) {
    return false;
  }

  const version = readCanonicalVarint(bytes, 0);
  if (version === undefined || version.value !== 1n) {
    return false;
  }
  const codec = readCanonicalVarint(bytes, version.nextOffset);
  if (codec === undefined) {
    return false;
  }
  const hashCode = readCanonicalVarint(bytes, codec.nextOffset);
  if (hashCode === undefined) {
    return false;
  }
  const digestLength = readCanonicalVarint(bytes, hashCode.nextOffset);
  return (
    digestLength !== undefined &&
    digestLength.value === BigInt(bytes.length - digestLength.nextOffset)
  );
}

export const CIDTextV1Schema = z
  .string()
  .refine(isCanonicalCidV1)
  .transform((value): CIDTextV1 => value);

export function parseCIDTextV1(value: unknown): CIDTextV1 {
  return CIDTextV1Schema.parse(value);
}

export function serializeCIDTextV1(value: CIDTextV1): string {
  return CIDTextV1Schema.parse(value);
}

export const IPFSUriV1Schema = z
  .string()
  .refine(
    (value) => value.startsWith("ipfs://") && isCanonicalCidV1(value.slice(7)),
  )
  .transform((value): IPFSUriV1 => value as IPFSUriV1);

export function parseIPFSUriV1(value: unknown): IPFSUriV1 {
  return IPFSUriV1Schema.parse(value);
}

export function ipfsUriV1FromCIDText(value: CIDTextV1): IPFSUriV1 {
  return IPFSUriV1Schema.parse(`ipfs://${CIDTextV1Schema.parse(value)}`);
}

export function cidTextFromIPFSUriV1(value: IPFSUriV1): CIDTextV1 {
  return CIDTextV1Schema.parse(IPFSUriV1Schema.parse(value).slice(7));
}

export function serializeIPFSUriV1(value: IPFSUriV1): string {
  return IPFSUriV1Schema.parse(value);
}
