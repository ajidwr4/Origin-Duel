import { isDeepStrictEqual } from "node:util";

export const FROZEN_TYPE2_SOURCE_TX_V1 = Object.freeze({
  input: {
    chainId: "11155111",
    nonce: "7",
    maxPriorityFeePerGas: "1000000000",
    maxFeePerGas: "2000000000",
    gasLimit: "21000",
    to: "0x1111111111111111111111111111111111111111",
    value: "123456789",
    input: "0x",
    accessList: [],
    yParity: 1,
    r: "0x1234",
    s: "0x5678",
  },
  expectedRawSignedType2:
    "0x02f583aa36a707843b9aca00847735940082520894111111111111111111111111111111111111111184075bcd1580c001821234825678",
  expectedSourceTx:
    "0xe8a1a631557a4b63768f2ea5dd7714f825ab39416d3e753c848e50e39dd24bab",
});

export function parseFrozenType2SourceTxV1(value) {
  if (!isDeepStrictEqual(value, FROZEN_TYPE2_SOURCE_TX_V1)) {
    throw new TypeError("invalid frozen Type-2 source transaction fixture");
  }
  return value;
}
