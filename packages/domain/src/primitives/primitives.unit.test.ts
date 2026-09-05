import { describe, expect, it } from "vitest";
import {
  Bytes32HexV1Schema,
  CIDTextV1Schema,
  cidTextFromIPFSUriV1,
  IPFSUriV1Schema,
  ipfsUriV1FromCIDText,
  normalizeWalletAddress,
  parseBytes32HexV1,
  parseCIDTextV1,
  parseIPFSUriV1,
  parseRfc3339UtcV1,
  parseTxHashV1,
  parseUuidV1,
  parseWalletAddress,
  Rfc3339UtcV1Schema,
  rfc3339UtcV1FromDate,
  serializeBytes32HexV1,
  serializeCIDTextV1,
  serializeIPFSUriV1,
  serializeRfc3339UtcV1,
  serializeTxHashV1,
  serializeUuidV1,
  serializeWalletAddress,
  TokenIdJsonV1Schema,
  tokenIdFromJson,
  tokenIdToJson,
  UINT256_MAX,
  UuidV1Schema,
  WalletAddressSchema,
  WeiAmountJsonV1Schema,
  weiAmountFromJson,
  weiAmountToJson,
} from "./index.js";

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as const;
const BYTES32 = `0x${"ab".repeat(32)}` as const;
const UUID = "3a4a24b8-32a4-4b46-8fab-2ff21cc6791c";
const TIMESTAMP = "2026-09-01T11:41:00.000Z";
const CID = "bafybeiaaaebagbafaydqqcikbmga2dqpcaireeyuculbogazdinryhi6d4";

describe("WalletAddress", () => {
  it("validates and serializes the canonical lowercase wire value", () => {
    expect(parseWalletAddress(ADDRESS)).toBe(ADDRESS);
    expect(serializeWalletAddress(parseWalletAddress(ADDRESS))).toBe(ADDRESS);
  });

  it("normalizes otherwise-valid external casing", () => {
    expect(
      normalizeWalletAddress("0x1234567890ABCDEF1234567890aBcDeF12345678"),
    ).toBe(ADDRESS);
  });

  it.each([
    "0x1234567890ABCDEF1234567890abcdef12345678",
    "1234567890abcdef1234567890abcdef12345678",
    "0x1234",
    `${ADDRESS}00`,
    "0x1234567890abcdef1234567890abcdef1234567g",
    ` ${ADDRESS}`,
    `${ADDRESS} `,
  ])("rejects noncanonical input %s", (value) => {
    expect(WalletAddressSchema.safeParse(value).success).toBe(false);
  });
});

describe("Bytes32HexV1 and TxHashV1", () => {
  it("share the exact parser and serializer rule", () => {
    expect(serializeBytes32HexV1(parseBytes32HexV1(BYTES32))).toBe(BYTES32);
    expect(serializeTxHashV1(parseTxHashV1(BYTES32))).toBe(BYTES32);
  });

  it.each([
    `0x${"AB".repeat(32)}`,
    "ab".repeat(32),
    `0x${"ab".repeat(31)}`,
    `0x${"ab".repeat(33)}`,
    `0x${"ag".repeat(32)}`,
    ` 0x${"ab".repeat(32)}`,
    `0x${"ab".repeat(32)} `,
  ])("rejects noncanonical input %s", (value) => {
    expect(Bytes32HexV1Schema.safeParse(value).success).toBe(false);
  });
});

describe("uint256 JSON boundaries", () => {
  it("accepts zero and the exact uint256 maximum", () => {
    expect(tokenIdFromJson("0")).toBe(0n);
    expect(tokenIdFromJson(UINT256_MAX.toString())).toBe(UINT256_MAX);
    expect(weiAmountFromJson("0")).toBe(0n);
    expect(weiAmountFromJson(UINT256_MAX.toString())).toBe(UINT256_MAX);
  });

  it.each(["01", "-1", "+1", "1.0", "1e3", " 1", "1 "])(
    "rejects noncanonical decimal %s",
    (value) => {
      expect(TokenIdJsonV1Schema.safeParse(value).success).toBe(false);
      expect(WeiAmountJsonV1Schema.safeParse(value).success).toBe(false);
    },
  );

  it("rejects uint256 overflow at both boundaries", () => {
    const overflow = (UINT256_MAX + 1n).toString();
    expect(() => tokenIdFromJson(overflow)).toThrow();
    expect(() => weiAmountFromJson(overflow)).toThrow();
    expect(() => tokenIdToJson(UINT256_MAX + 1n)).toThrow(RangeError);
    expect(() => weiAmountToJson(UINT256_MAX + 1n)).toThrow(RangeError);
    expect(() => tokenIdToJson(-1n)).toThrow(RangeError);
    expect(() => weiAmountToJson(-1n)).toThrow(RangeError);
  });

  it("round-trips with bigint semantics rather than lexical ordering", () => {
    expect(tokenIdFromJson(tokenIdToJson(10n))).toBe(10n);
    expect(weiAmountFromJson(weiAmountToJson(2n))).toBe(2n);
    expect("10" < "2").toBe(true);
    expect(tokenIdFromJson("10") > tokenIdFromJson("2")).toBe(true);
  });
});

describe("UuidV1", () => {
  it("validates and serializes canonical lowercase UUID text", () => {
    expect(serializeUuidV1(parseUuidV1(UUID))).toBe(UUID);
  });

  it.each([
    UUID.toUpperCase(),
    "3a4a24b832a44b468fab2ff21cc6791c",
    "3a4a24b8-32a4-4b46-7fab-2ff21cc6791c",
    ` ${UUID}`,
    `${UUID} `,
  ])("rejects malformed or noncanonical UUID %s", (value) => {
    expect(UuidV1Schema.safeParse(value).success).toBe(false);
  });
});

describe("Rfc3339UtcV1", () => {
  it("validates, serializes, and creates exact UTC millisecond text", () => {
    expect(serializeRfc3339UtcV1(parseRfc3339UtcV1(TIMESTAMP))).toBe(TIMESTAMP);
    expect(rfc3339UtcV1FromDate(new Date(TIMESTAMP))).toBe(TIMESTAMP);
  });

  it.each([
    "2026-09-01T11:41:00Z",
    "2026-09-01T11:41:00.00Z",
    "2026-09-01T11:41:00.0000Z",
    "2026-09-01T11:41:00.000+00:00",
    "2026-02-29T11:41:00.000Z",
    "2026-13-01T11:41:00.000Z",
    "2026-09-01T24:00:00.000Z",
    ` ${TIMESTAMP}`,
    `${TIMESTAMP} `,
  ])("rejects invalid or noncanonical timestamp %s", (value) => {
    expect(Rfc3339UtcV1Schema.safeParse(value).success).toBe(false);
  });
});

describe("CIDTextV1 and IPFSUriV1", () => {
  it("validates and round-trips canonical CIDv1 base32 text", () => {
    expect(serializeCIDTextV1(parseCIDTextV1(CID))).toBe(CID);
  });

  it.each([
    CID.toUpperCase(),
    CID.slice(1),
    `Qm${"a".repeat(44)}`,
    "bafy",
    `${CID}/image.png`,
    `${CID}?download=1`,
    `${CID}#image`,
    `ipfs://${CID}`,
    `https://ipfs.io/ipfs/${CID}`,
    ` ${CID}`,
    `${CID} `,
  ])("rejects malformed or noncanonical CID text %s", (value) => {
    expect(CIDTextV1Schema.safeParse(value).success).toBe(false);
  });

  it("constructs, parses, extracts, and serializes the exact IPFS URI", () => {
    const uri = `ipfs://${CID}` as const;
    expect(ipfsUriV1FromCIDText(parseCIDTextV1(CID))).toBe(uri);
    expect(cidTextFromIPFSUriV1(parseIPFSUriV1(uri))).toBe(CID);
    expect(serializeIPFSUriV1(parseIPFSUriV1(uri))).toBe(uri);
  });

  it.each([
    CID,
    `IPFS://${CID}`,
    `ipfs://${CID.toUpperCase()}`,
    `ipfs://${CID}/image.png`,
    `ipfs://${CID}?download=1`,
    `ipfs://${CID}#image`,
    `https://ipfs.io/ipfs/${CID}`,
    ` ipfs://${CID}`,
  ])("rejects malformed or noncanonical IPFS URI %s", (value) => {
    expect(IPFSUriV1Schema.safeParse(value).success).toBe(false);
  });
});
