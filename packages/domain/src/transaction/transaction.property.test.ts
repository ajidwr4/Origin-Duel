import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { UINT256_MAX } from "../primitives/index.js";
import {
  activityClassFromDnaV1,
  deriveTransactionDnaV1,
  entropySeedFromDnaV1,
  reconstructSignedType2V1,
  type Type2TransactionV1,
} from "./index.js";

describe("transaction deterministic properties", () => {
  it("round-trips the activity byte and preserves entropy isolation", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }),
        fc.bigInt({ min: 0n, max: (1n << 64n) - 1n }),
        fc.bigInt({ min: 0n, max: UINT256_MAX }),
        (activityClass, blockHeight, transactionIndex) => {
          const base = deriveTransactionDnaV1({
            activityClass: activityClass as 0 | 1 | 2 | 3 | 4 | 5,
            blockHeight,
            transactionIndex,
          });
          const changed = deriveTransactionDnaV1({
            activityClass: ((activityClass + 1) % 6) as 0 | 1 | 2 | 3 | 4 | 5,
            blockHeight,
            transactionIndex,
          });
          expect(activityClassFromDnaV1(base.transactionDNA)).toBe(
            activityClass,
          );
          expect(entropySeedFromDnaV1(base.transactionDNA)).toBe(
            base.entropySeed,
          );
          expect(changed.entropySeed).toBe(base.entropySeed);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("reconstructs bounded uint256 fields deterministically", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: UINT256_MAX }),
        fc.bigInt({ min: 0n, max: UINT256_MAX }),
        (nonce, value) => {
          const transaction: Type2TransactionV1 = {
            txType: 2,
            chainId: 11_155_111n,
            nonce,
            maxPriorityFeePerGas: 0n,
            maxFeePerGas: 0n,
            gasLimit: 0n,
            to: null,
            value,
            input: "0x",
            accessList: [],
            yParity: 0,
            r: 0n,
            s: 0n,
          };
          expect(reconstructSignedType2V1(transaction)).toBe(
            reconstructSignedType2V1(transaction),
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
