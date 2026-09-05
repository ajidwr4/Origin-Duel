export interface FrozenType2SourceTxV1 {
  readonly input: {
    readonly chainId: string;
    readonly nonce: string;
    readonly maxPriorityFeePerGas: string;
    readonly maxFeePerGas: string;
    readonly gasLimit: string;
    readonly to: `0x${string}`;
    readonly value: string;
    readonly input: `0x${string}`;
    readonly accessList: readonly [];
    readonly yParity: 1;
    readonly r: `0x${string}`;
    readonly s: `0x${string}`;
  };
  readonly expectedRawSignedType2: `0x${string}`;
  readonly expectedSourceTx: `0x${string}`;
}

export declare const FROZEN_TYPE2_SOURCE_TX_V1: FrozenType2SourceTxV1;
export declare function parseFrozenType2SourceTxV1(
  value: unknown,
): FrozenType2SourceTxV1;
