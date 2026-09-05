export type FixtureBytes32V1 = `0x${string}`;

export interface FrozenTransactionDnaV1 {
  readonly input: {
    readonly activityClass: 3;
    readonly blockHeight: string;
    readonly transactionIndex: string;
    readonly generationSpecVersion: 1;
  };
  readonly expectedEntropyDigest: FixtureBytes32V1;
  readonly expectedEntropyPayload: FixtureBytes32V1;
  readonly expectedTransactionDNA: FixtureBytes32V1;
  readonly expectedEntropySeed: FixtureBytes32V1;
  readonly expectedSample0: Readonly<{
    level: FixtureBytes32V1;
    element: FixtureBytes32V1;
    species: FixtureBytes32V1;
    rarity: FixtureBytes32V1;
    statAllocation: FixtureBytes32V1;
  }>;
}

export declare const FROZEN_TRANSACTION_DNA_V1: FrozenTransactionDnaV1;
export declare function parseFrozenTransactionDnaV1(
  value: unknown,
): FrozenTransactionDnaV1;
