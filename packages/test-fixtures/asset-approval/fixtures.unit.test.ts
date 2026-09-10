import {
  AbiCoder,
  verifyTypedData as ethersVerifyTypedData,
  keccak256,
  toUtf8Bytes,
  Wallet,
} from "ethers";
import { hashTypedData, verifyTypedData } from "viem";
import { describe, expect, it } from "vitest";

/**
 * SIG-01 frozen AssetApproval EIP-712 fixture (TEST-ONLY, not deployment values).
 *
 * Expected outputs were derived independently in Solidity (M03-T05) and frozen
 * here, so neither Ethers nor Viem is the oracle for the other.
 */
export const FROZEN_ASSET_APPROVAL_V1 = Object.freeze({
  input: Object.freeze({
    chainId: "102031",
    verifyingContract: "0x1111111111111111111111111111111111111111",
    privateTestKey: `0x${"a11ce".padStart(64, "0")}`,
    claimant: "0x2222222222222222222222222222222222222222",
    sourceTx:
      "0xe8a1a631557a4b63768f2ea5dd7714f825ab39416d3e753c848e50e39dd24bab",
    attemptKey: `0x${"feed".padStart(64, "0")}`,
    monster: Object.freeze({
      speciesId: 7,
      level: 3,
      atk: 800,
      def: 1200,
      element: 2,
      rarity: 1,
      transactionDNA:
        "0x03c4594447d168c8bf50701a468dfb08d85e06f4496f3315d6359f134ede6da8",
    }),
    tokenURI: "ipfs://origin-duel/asset-approval/0",
    validUntil: "2000000000",
  }),
  expectedMonsterHash:
    "0x0e5931da31dcc90280fdaa6572a2a0d951a0d71fab9ba24181f1f4f44cfaebaf",
  expectedDomainSeparator:
    "0x9214da51cea30e8f62463b4933d6bc36fb12808821d28fccbc937e5b5ef7844b",
  expectedTypedDataDigest:
    "0x4a6011371be87f66f21a99c2e16bd7e271326ff222e54013fa2b2cbd0c85864d",
  expectedSignature: Object.freeze({
    r: "0x1745d3a9ad8b87a199e83d09830d42894fd5ee51a7650968986605966b035c7a",
    s: "0x0daef96d1f9188431d4a2db293fc4514b8d5e9965cfc0f95ff68d4af7c904b67",
    yParity: 1,
  }),
  expectedSigner: "0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7",
});

const TYPES = {
  AssetApprovalV1: [
    { name: "claimant", type: "address" },
    { name: "sourceTx", type: "bytes32" },
    { name: "attemptKey", type: "bytes32" },
    { name: "monsterHash", type: "bytes32" },
    { name: "tokenURI", type: "string" },
    { name: "generationSpecVersion", type: "uint16" },
    { name: "artSpecVersion", type: "uint16" },
    { name: "metadataSpecVersion", type: "uint16" },
    { name: "validUntil", type: "uint64" },
  ],
} as const;

const MONSTER_HASH_ABI_TYPES = [
  "bytes32",
  "uint16",
  "uint8",
  "uint16",
  "uint16",
  "uint8",
  "uint8",
  "bytes32",
  "bytes32",
] as const;

const FIXTURE = FROZEN_ASSET_APPROVAL_V1;
const MONSTER = FIXTURE.input.monster;

const DOMAIN = {
  name: "Origin Duel Asset Approval",
  version: "1",
  chainId: 102031,
  verifyingContract: FIXTURE.input.verifyingContract,
};

const MESSAGE = {
  claimant: FIXTURE.input.claimant,
  sourceTx: FIXTURE.input.sourceTx,
  attemptKey: FIXTURE.input.attemptKey,
  monsterHash: FIXTURE.expectedMonsterHash,
  tokenURI: FIXTURE.input.tokenURI,
  generationSpecVersion: 1,
  artSpecVersion: 1,
  metadataSpecVersion: 1,
  validUntil: Number(FIXTURE.input.validUntil),
};

const signature65 =
  FIXTURE.expectedSignature.r +
  FIXTURE.expectedSignature.s.slice(2) +
  (FIXTURE.expectedSignature.yParity === 1 ? "1c" : "1b");

describe("SIG-01 frozen AssetApproval fixture parity", () => {
  it("recomputes monsterHash with the Ethers ABI coder and keccak", () => {
    const coder = new AbiCoder();
    const domainConst = keccak256(toUtf8Bytes("BUIDL_CTC_RESOLVED_MONSTER_V1"));
    const encoded = coder.encode(
      [...MONSTER_HASH_ABI_TYPES],
      [
        domainConst,
        MONSTER.speciesId,
        MONSTER.level,
        MONSTER.atk,
        MONSTER.def,
        MONSTER.element,
        MONSTER.rarity,
        MONSTER.transactionDNA,
        FIXTURE.input.sourceTx,
      ],
    );
    expect(keccak256(encoded)).toBe(FIXTURE.expectedMonsterHash);
  });

  it("Viem typed-data digest equals the frozen Solidity digest", () => {
    const digest = hashTypedData({
      domain: {
        name: "Origin Duel Asset Approval",
        version: "1",
        chainId: 102031,
        verifyingContract: FIXTURE.input.verifyingContract as `0x${string}`,
      },
      types: TYPES,
      primaryType: "AssetApprovalV1",
      message: MESSAGE as unknown as Record<string, unknown>,
    });
    expect(digest).toBe(FIXTURE.expectedTypedDataDigest);
  });

  it("Ethers signs the frozen digest to the frozen signature bytes", async () => {
    const wallet = new Wallet(FIXTURE.input.privateTestKey);
    const signed = await wallet.signTypedData(DOMAIN, TYPES, MESSAGE);
    expect(signed).toBe(signature65);

    // Direct key-path signature over the frozen digest (independent of
    // Ethers' typed-data hashing) reproduces the exact r/s/yParity.
    const sig = wallet.signingKey.sign(FIXTURE.expectedTypedDataDigest);
    expect(sig.r).toBe(FIXTURE.expectedSignature.r);
    expect(sig.s).toBe(FIXTURE.expectedSignature.s);
    expect(sig.yParity).toBe(FIXTURE.expectedSignature.yParity);
  });

  it("Viem recovers the frozen signer from the frozen digest and signature", async () => {
    const valid = await verifyTypedData({
      address: FIXTURE.expectedSigner as `0x${string}`,
      domain: {
        name: "Origin Duel Asset Approval",
        version: "1",
        chainId: 102031,
        verifyingContract: FIXTURE.input.verifyingContract as `0x${string}`,
      },
      types: TYPES,
      primaryType: "AssetApprovalV1",
      message: MESSAGE as unknown as Record<string, unknown>,
      signature: signature65 as `0x${string}`,
    });
    expect(valid).toBe(true);
  });

  it("Ethers recovers the frozen signer from the same inputs", () => {
    const recovered = ethersVerifyTypedData(
      DOMAIN,
      TYPES,
      MESSAGE,
      signature65,
    );
    expect(recovered).toBe(FIXTURE.expectedSigner);
  });
});
