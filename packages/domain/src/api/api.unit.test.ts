import { describe, expect, it } from "vitest";
import { MAX_ENCODED_TRANSACTION_BYTES_V1 } from "../constants/index.js";
import { UINT256_MAX } from "../primitives/index.js";
import {
  ApiErrorResponseV1Schema,
  AttestcoinProofPayloadV1Schema,
  AuthChallengeRequestV1Schema,
  AuthVerifyRequestV1Schema,
  BattleEligibilityV1Schema,
  CaptureViewStateV1Schema,
  CaptureWorkflowStatusV1Schema,
  CreditcoinTxReceiptV1Schema,
  RetryCaptureRequestV1Schema,
  SepoliaAdvisoryV1Schema,
  StartCaptureRequestV1Schema,
} from "./index.js";

const ADDRESS = `0x${"11".repeat(20)}`;
const HASH = `0x${"22".repeat(32)}`;
const UUID = "3a4a24b8-32a4-4b46-8fab-2ff21cc6791c";

const proofPayload = (encodedTransaction: string) => ({
  chainKey: 1,
  blockHeight: "1",
  encodedTransaction,
  merkleRoot: HASH,
  siblings: [],
  lowerEndpointDigest: HASH,
  continuityRoots: [],
});

describe("API mutation schemas", () => {
  it("preserves exact capture workflow and player-facing states", () => {
    expect(CaptureWorkflowStatusV1Schema.options).toEqual([
      "CHECKING_TRANSACTION",
      "WAITING_FOR_ATTESTATION",
      "GENERATING_PROOF",
      "PREFLIGHTING",
      "SOURCE_BOUND",
      "FAILED_RETRYABLE",
      "REJECTED",
    ]);
    expect(CaptureViewStateV1Schema.options).toEqual([
      "CHECKING_TRANSACTION",
      "WAITING_FOR_VERIFICATION_DATA",
      "PREPARING_PROOF",
      "PREPARING_MONSTER",
      "CREATING_CARD",
      "READY_TO_MINT",
      "WAITING_FOR_WALLET",
      "TRANSACTION_SUBMITTED",
      "CONFIRMING",
      "CONFIRMING_TRANSACTION_STATUS",
      "MONSTER_CREATED",
      "ACTION_NEEDED",
      "TRY_AGAIN_LATER",
      "NOT_ELIGIBLE",
    ]);
  });

  it("accepts exact client intent and rejects authority-owned or unknown fields", () => {
    expect(
      AuthChallengeRequestV1Schema.parse({ walletAddress: ADDRESS }),
    ).toEqual({
      walletAddress: ADDRESS,
    });
    expect(StartCaptureRequestV1Schema.parse({ claimedTxHash: HASH })).toEqual({
      claimedTxHash: HASH,
    });
    expect(RetryCaptureRequestV1Schema.parse({})).toEqual({});

    expect(
      StartCaptureRequestV1Schema.safeParse({
        claimedTxHash: HASH,
        sourceTx: HASH,
      }).success,
    ).toBe(false);
    expect(RetryCaptureRequestV1Schema.safeParse({ retry: true }).success).toBe(
      false,
    );
    expect(
      AuthVerifyRequestV1Schema.safeParse({
        challengeId: UUID,
        signature: `0x${"aa".repeat(65)}`,
        walletAddress: ADDRESS,
      }).success,
    ).toBe(false);
  });

  it("closes the API error envelope and its meta object", () => {
    const error = {
      error: {
        code: "MATCH_VERSION_STALE",
        category: "STALE_STATE",
        message: "stale version",
        retryable: false,
        requestId: UUID,
        meta: { currentMatchVersion: 4 },
      },
    } as const;

    expect(ApiErrorResponseV1Schema.parse(error)).toEqual(error);
    expect(
      ApiErrorResponseV1Schema.safeParse({
        ...error,
        error: {
          ...error.error,
          meta: { currentMatchVersion: 4, hidden: true },
        },
      }).success,
    ).toBe(false);
  });
});

describe("normalized chain schemas", () => {
  it("enforces the canonical encoded transaction byte boundary", () => {
    expect(
      AttestcoinProofPayloadV1Schema.safeParse(
        proofPayload(`0x${"ab".repeat(MAX_ENCODED_TRANSACTION_BYTES_V1)}`),
      ).success,
    ).toBe(true);
    expect(
      AttestcoinProofPayloadV1Schema.safeParse(
        proofPayload(`0x${"ab".repeat(MAX_ENCODED_TRANSACTION_BYTES_V1 + 1)}`),
      ).success,
    ).toBe(false);
    expect(
      AttestcoinProofPayloadV1Schema.safeParse(proofPayload("0xabc")).success,
    ).toBe(false);
    expect(
      AttestcoinProofPayloadV1Schema.safeParse(proofPayload("0xAB")).success,
    ).toBe(false);
  });

  it("uses canonical decimal strings for uint256 values", () => {
    expect(
      CreditcoinTxReceiptV1Schema.parse({
        txHash: HASH,
        from: ADDRESS,
        nonce: UINT256_MAX.toString(10),
      }).nonce,
    ).toBe(UINT256_MAX.toString(10));

    expect(
      CreditcoinTxReceiptV1Schema.safeParse({
        txHash: HASH,
        from: ADDRESS,
        nonce: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
    expect(
      SepoliaAdvisoryV1Schema.safeParse({
        lookupStatus: "FOUND_MINED",
        claimedTxHash: HASH,
        verified: true,
      }).success,
    ).toBe(false);
  });

  it("enforces the exact collection threshold union", () => {
    expect(
      BattleEligibilityV1Schema.parse({
        status: "AT_LEAST_15",
        eligibleCount: 15,
      }),
    ).toEqual({ status: "AT_LEAST_15", eligibleCount: 15 });
    expect(
      BattleEligibilityV1Schema.safeParse({
        status: "BELOW_15",
        eligibleCount: 15,
      }).success,
    ).toBe(false);
  });
});
