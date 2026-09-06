import {
  ActivityClass,
  type ActivityClassV1,
  MAX_CLASSIFIER_LOG_DATA_BYTES_V1,
  MAX_CLASSIFIER_LOGS_V1,
  MAX_ENCODED_TRANSACTION_BYTES_V1,
} from "../constants/index.js";
import type { WalletAddress } from "../primitives/index.js";
import { type HexV1, hexToBytes } from "./keccak.js";

export const TRANSFER_EVENT_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const TRANSFER_SINGLE_EVENT_TOPIC =
  "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
export const TRANSFER_BATCH_EVENT_TOPIC =
  "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb";

export interface ClassifierLogV1 {
  readonly topics: readonly string[];
  readonly data: HexV1;
}

export interface ClassifierInputV1 {
  readonly sourceActor: WalletAddress;
  readonly hasTo: boolean;
  readonly value: bigint;
  readonly input: HexV1;
  readonly logs: readonly ClassifierLogV1[];
}

export function assertEncodedTransactionResourceV1(
  encodedTransaction: HexV1 | Uint8Array,
): void {
  const length =
    typeof encodedTransaction === "string"
      ? hexToBytes(encodedTransaction).length
      : encodedTransaction.length;
  if (length > MAX_ENCODED_TRANSACTION_BYTES_V1) {
    throw new RangeError("unsupported source resource");
  }
}

function addressFromTopic(topic: string): WalletAddress | undefined {
  if (!/^0x0{24}[0-9a-f]{40}$/.test(topic)) return undefined;
  return `0x${topic.slice(26)}` as WalletAddress;
}

function actorInvolvement(
  topics: readonly string[],
  fromIndex: number,
  toIndex: number,
  actor: WalletAddress,
): boolean {
  const from = addressFromTopic(topics[fromIndex] ?? "");
  const to = addressFromTopic(topics[toIndex] ?? "");
  return (
    from !== undefined && to !== undefined && (from === actor || to === actor)
  );
}

function readWord(bytes: Uint8Array, offset: number): bigint | undefined {
  if (offset < 0 || offset + 32 > bytes.length) return undefined;
  let value = 0n;
  for (let index = offset; index < offset + 32; index += 1) {
    value = (value << 8n) | BigInt(bytes[index] ?? 0);
  }
  return value;
}

function isCanonicalTransferBatchData(bytes: Uint8Array): boolean {
  if (bytes.length < 128 || bytes.length % 32 !== 0) return false;
  const idsOffset = readWord(bytes, 0);
  const valuesOffset = readWord(bytes, 32);
  if (idsOffset !== 64n) return false;
  const idsLength = readWord(bytes, 64);
  if (
    idsLength === undefined ||
    idsLength > BigInt((bytes.length - 128) / 64)
  ) {
    return false;
  }
  const expectedValuesOffset = 96n + idsLength * 32n;
  if (
    valuesOffset !== expectedValuesOffset ||
    valuesOffset > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return false;
  }
  const valuesLength = readWord(bytes, Number(valuesOffset));
  if (valuesLength !== idsLength) return false;
  return BigInt(bytes.length) === valuesOffset + 32n + valuesLength * 32n;
}

function recognizedClass(
  log: ClassifierLogV1,
  actor: WalletAddress,
): ActivityClassV1 | undefined {
  let data: Uint8Array;
  try {
    data = hexToBytes(log.data);
  } catch {
    return undefined;
  }
  if (data.length > MAX_CLASSIFIER_LOG_DATA_BYTES_V1) return undefined;
  const topic0 = log.topics[0];
  if (
    topic0 === TRANSFER_EVENT_TOPIC &&
    log.topics.length === 3 &&
    data.length === 32 &&
    actorInvolvement(log.topics, 1, 2, actor)
  ) {
    return ActivityClass.ERC20_ACTIVITY;
  }
  if (
    topic0 === TRANSFER_EVENT_TOPIC &&
    log.topics.length === 4 &&
    data.length === 0 &&
    actorInvolvement(log.topics, 1, 2, actor)
  ) {
    return ActivityClass.ERC721_ACTIVITY;
  }
  if (
    topic0 === TRANSFER_SINGLE_EVENT_TOPIC &&
    log.topics.length === 4 &&
    data.length === 64 &&
    addressFromTopic(log.topics[1] ?? "") &&
    actorInvolvement(log.topics, 2, 3, actor)
  ) {
    return ActivityClass.ERC1155_ACTIVITY;
  }
  if (
    topic0 === TRANSFER_BATCH_EVENT_TOPIC &&
    log.topics.length === 4 &&
    addressFromTopic(log.topics[1] ?? "") &&
    actorInvolvement(log.topics, 2, 3, actor) &&
    isCanonicalTransferBatchData(data)
  ) {
    return ActivityClass.ERC1155_ACTIVITY;
  }
  return undefined;
}

export function classifyTransactionV1(
  value: ClassifierInputV1,
): ActivityClassV1 {
  if (!/^0x[0-9a-f]{40}$/.test(value.sourceActor)) {
    throw new TypeError("invalid sourceActor");
  }
  if (typeof value.value !== "bigint" || value.value < 0n) {
    throw new RangeError("invalid transaction value");
  }
  const inputBytes = hexToBytes(value.input);
  if (value.logs.length > MAX_CLASSIFIER_LOGS_V1) {
    return ActivityClass.CONTRACT_INTERACTION;
  }

  const classes = new Set<ActivityClassV1>();
  for (const log of value.logs) {
    const found = recognizedClass(log, value.sourceActor);
    if (found !== undefined) classes.add(found);
    if (classes.size > 1) return ActivityClass.CONTRACT_INTERACTION;
  }
  if (classes.size === 1) {
    return classes.values().next().value as ActivityClassV1;
  }
  if (
    value.hasTo &&
    value.value > 0n &&
    inputBytes.length === 0 &&
    value.logs.length === 0
  ) {
    return ActivityClass.NATIVE_TRANSFER;
  }
  if (!value.hasTo || inputBytes.length > 0 || value.logs.length > 0) {
    return ActivityClass.CONTRACT_INTERACTION;
  }
  return ActivityClass.UNKNOWN;
}
