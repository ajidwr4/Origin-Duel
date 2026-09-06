import { describe, expect, it } from "vitest";
import { FROZEN_TYPE2_SOURCE_TX_V1 } from "../../../test-fixtures/source-tx/index.js";
import type { WalletAddress } from "../primitives/index.js";
import {
  deriveCanonicalSourceTxV1,
  reconstructSignedType2V1,
  type Type2TransactionV1,
} from "./index.js";

describe("TX-01 TypeScript parity", () => {
  it("reproduces the source-owned Type-2 raw bytes and sourceTx", () => {
    const fixture = FROZEN_TYPE2_SOURCE_TX_V1;
    const transaction: Type2TransactionV1 = {
      txType: 2,
      chainId: BigInt(fixture.input.chainId),
      nonce: BigInt(fixture.input.nonce),
      maxPriorityFeePerGas: BigInt(fixture.input.maxPriorityFeePerGas),
      maxFeePerGas: BigInt(fixture.input.maxFeePerGas),
      gasLimit: BigInt(fixture.input.gasLimit),
      to: fixture.input.to as WalletAddress,
      value: BigInt(fixture.input.value),
      input: fixture.input.input,
      accessList: fixture.input.accessList,
      yParity: fixture.input.yParity,
      r: BigInt(fixture.input.r),
      s: BigInt(fixture.input.s),
    };

    expect(reconstructSignedType2V1(transaction)).toBe(
      fixture.expectedRawSignedType2,
    );
    expect(deriveCanonicalSourceTxV1(transaction)).toBe(
      fixture.expectedSourceTx,
    );
  });
});
