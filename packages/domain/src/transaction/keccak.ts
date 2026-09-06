import type { Bytes32HexV1 } from "../primitives/index.js";

const MASK_64 = (1n << 64n) - 1n;
const RATE_BYTES = 136;
const ROTATION = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18,
  2, 61, 56, 14,
] as const;
const ROUND_CONSTANTS = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n,
] as const;

export type HexV1 = `0x${string}`;

export function hexToBytes(value: string): Uint8Array {
  if (!/^0x(?:[0-9a-f]{2})*$/.test(value)) {
    throw new TypeError(
      "hex bytes must be canonical lowercase even-length hex",
    );
  }
  const bytes = new Uint8Array((value.length - 2) / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(
      value.slice(2 + index * 2, 4 + index * 2),
      16,
    );
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): HexV1 {
  let value = "0x";
  for (const byte of bytes) value += byte.toString(16).padStart(2, "0");
  return value as HexV1;
}

export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function rotateLeft64(value: bigint, shift: number): bigint {
  if (shift === 0) return value;
  const bits = BigInt(shift);
  return ((value << bits) | (value >> (64n - bits))) & MASK_64;
}

function keccakF(state: bigint[]): void {
  const column = new Array<bigint>(5).fill(0n);
  const rotated = new Array<bigint>(25).fill(0n);

  for (const roundConstant of ROUND_CONSTANTS) {
    for (let x = 0; x < 5; x += 1) {
      column[x] =
        (state[x] ?? 0n) ^
        (state[x + 5] ?? 0n) ^
        (state[x + 10] ?? 0n) ^
        (state[x + 15] ?? 0n) ^
        (state[x + 20] ?? 0n);
    }
    for (let x = 0; x < 5; x += 1) {
      const delta =
        (column[(x + 4) % 5] ?? 0n) ^
        rotateLeft64(column[(x + 1) % 5] ?? 0n, 1);
      for (let y = 0; y < 5; y += 1) {
        const index = x + 5 * y;
        state[index] = ((state[index] ?? 0n) ^ delta) & MASK_64;
      }
    }
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        const index = x + 5 * y;
        rotated[y + 5 * ((2 * x + 3 * y) % 5)] = rotateLeft64(
          state[index] ?? 0n,
          ROTATION[index] ?? 0,
        );
      }
    }
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        const index = x + 5 * y;
        state[index] =
          ((rotated[index] ?? 0n) ^
            (~(rotated[((x + 1) % 5) + 5 * y] ?? 0n) &
              (rotated[((x + 2) % 5) + 5 * y] ?? 0n))) &
          MASK_64;
      }
    }
    state[0] = ((state[0] ?? 0n) ^ roundConstant) & MASK_64;
  }
}

export function keccak256Bytes(message: Uint8Array): Uint8Array {
  const paddingLength = RATE_BYTES - (message.length % RATE_BYTES);
  const padded = new Uint8Array(message.length + paddingLength);
  padded.set(message);
  padded[message.length] = 0x01;
  padded[padded.length - 1] = (padded[padded.length - 1] ?? 0) | 0x80;

  const state = new Array<bigint>(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += RATE_BYTES) {
    for (let lane = 0; lane < RATE_BYTES / 8; lane += 1) {
      let value = 0n;
      for (let byte = 0; byte < 8; byte += 1) {
        value |=
          BigInt(padded[offset + lane * 8 + byte] ?? 0) << BigInt(byte * 8);
      }
      state[lane] = ((state[lane] ?? 0n) ^ value) & MASK_64;
    }
    keccakF(state);
  }

  const output = new Uint8Array(32);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number(
      ((state[Math.floor(index / 8)] ?? 0n) >> BigInt((index % 8) * 8)) & 0xffn,
    );
  }
  return output;
}

export function keccak256(value: Uint8Array | HexV1): Bytes32HexV1 {
  return bytesToHex(
    keccak256Bytes(typeof value === "string" ? hexToBytes(value) : value),
  ) as Bytes32HexV1;
}
