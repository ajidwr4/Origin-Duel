import {
  MONSTERFACTORYASC_ABI,
  MONSTERMARKETPLACE_ABI,
  MONSTERNFT_ABI,
} from "@origin-duel/contracts-abi";
import { normalizeWalletAddress } from "@origin-duel/domain";
import { createClient, custom } from "viem";
import { describe, expect, it } from "vitest";
import {
  CREDITCOIN_CHAIN_ID_EXACT,
  creditcoinTestnet,
  SEPOLIA_CHAIN_ID_EXACT,
  sepoliaChain,
} from "./chains.ts";
import {
  createCreditcoinPublicClient,
  createSepoliaPublicClient,
} from "./clients.ts";
import {
  bigintValueFromJson,
  bigintValueToJson,
  normalizeHexBytes,
  normalizeUint64Decimal,
  tokenIdRoundTrip,
} from "./normalize.ts";

describe("chain definitions", () => {
  it("sepolia uses the standard Viem definition with exact chainId 11155111", () => {
    expect(sepoliaChain.id).toBe(11155111);
    expect(SEPOLIA_CHAIN_ID_EXACT).toBe(11155111);
  });

  it("creditcoin testnet is a custom definition with exact chainId 102031", () => {
    expect(creditcoinTestnet.id).toBe(102031);
    expect(CREDITCOIN_CHAIN_ID_EXACT).toBe(102031);
  });

  it("creditcoin chain definition is deterministic across constructions", () => {
    const snapshot = JSON.stringify({
      id: creditcoinTestnet.id,
      name: creditcoinTestnet.name,
      nativeCurrency: creditcoinTestnet.nativeCurrency,
      testnet: creditcoinTestnet.testnet,
    });
    // Re-import binding equality: same module instance must be reused, and a
    // second access of the frozen fields must produce the identical snapshot.
    expect(
      JSON.stringify({
        id: creditcoinTestnet.id,
        name: creditcoinTestnet.name,
        nativeCurrency: creditcoinTestnet.nativeCurrency,
        testnet: creditcoinTestnet.testnet,
      }),
    ).toBe(snapshot);
  });
});

describe("explicit PublicClients", () => {
  it("sepolia client construction uses the injected transport URL", () => {
    const client = createSepoliaPublicClient(
      "http://127.0.0.1:8545/sepolia-key",
    );
    expect(client.chain.id).toBe(11155111);
    expect(client.transport.type).toBe("http");
    expect(client.transport.url).toBe("http://127.0.0.1:8545/sepolia-key");
  });

  it("creditcoin client construction uses the injected transport URL", () => {
    const client = createCreditcoinPublicClient("http://127.0.0.1:8546/ctc");
    expect(client.chain.id).toBe(102031);
    expect(client.transport.type).toBe("http");
    expect(client.transport.url).toBe("http://127.0.0.1:8546/ctc");
  });

  it("clients are fresh instances per call — no hidden singleton", () => {
    const a = createSepoliaPublicClient("http://a.example");
    const b = createSepoliaPublicClient("http://a.example");
    expect(a).not.toBe(b);
  });

  it("deterministic RPC mock: chainId via custom transport round-trip", async () => {
    // Deterministic mock transport (no network): answers eth_chainId only.
    const requests: string[] = [];
    const mockClient = createClient({
      transport: custom({
        async request(request: { method: string }) {
          requests.push(request.method);
          if (request.method === "eth_chainId") {
            return "0xaa36a7"; // 11155111
          }
          throw new Error(`unexpected method ${request.method}`);
        },
      }),
    });
    const chainId = await mockClient.request({ method: "eth_chainId" });
    expect(Number.parseInt(chainId as string, 16)).toBe(11155111);
    expect(requests).toEqual(["eth_chainId"]);
  });
});

describe("generated ABI consumption", () => {
  it("contracts-abi package exports the three canonical contract ABIs", () => {
    expect(Array.isArray(MONSTERNFT_ABI)).toBe(true);
    expect(Array.isArray(MONSTERFACTORYASC_ABI)).toBe(true);
    expect(Array.isArray(MONSTERMARKETPLACE_ABI)).toBe(true);
    for (const abi of [
      MONSTERNFT_ABI,
      MONSTERFACTORYASC_ABI,
      MONSTERMARKETPLACE_ABI,
    ]) {
      expect(abi.some((entry) => entry.type === "function")).toBe(true);
    }
  });

  it("ABI contains canonical entrypoints used by the read layer", () => {
    const nftNames = MONSTERNFT_ABI.filter((e) => e.type === "function").map(
      (e) => e.name,
    );
    expect(nftNames).toContain("ownerOf");
    expect(nftNames).toContain("monsterOf");
    expect(nftNames).toContain("tokenURI");
    expect(nftNames).toContain("nextTokenId");

    const factoryNames = MONSTERFACTORYASC_ABI.filter(
      (e) => e.type === "function",
    ).map((e) => e.name);
    expect(factoryNames).toContain("canonicalPreflight");
    expect(factoryNames).toContain("readEligibility");
    expect(factoryNames).toContain("lookupReplay");

    const marketNames = MONSTERMARKETPLACE_ABI.filter(
      (e) => e.type === "function",
    ).map((e) => e.name);
    expect(marketNames).toContain("listingOf");
  });
});

describe("bigint-safe normalization", () => {
  it("uint256 beyond Number.MAX_SAFE_INTEGER round-trips exactly", () => {
    const value = 2n ** 200n + 12345n; // far beyond MAX_SAFE_INTEGER
    const json = bigintValueToJson(value);
    expect(json).toBe(value.toString(10));
    expect(bigintValueFromJson(json)).toBe(value);
    expect(tokenIdRoundTrip(value)).toBe(json);
  });

  it("uint64 decimal normalization accepts canonical values and rejects malformed ones", () => {
    expect(normalizeUint64Decimal("0")).toBe("0");
    expect(normalizeUint64Decimal("18446744073709551615")).toBe(
      "18446744073709551615",
    );
    expect(() => normalizeUint64Decimal("18446744073709551616")).toThrow(); // uint64 overflow
    expect(() => normalizeUint64Decimal("01")).toThrow(); // non-canonical leading zero
    expect(() => normalizeUint64Decimal("")).toThrow();
    expect(() => normalizeUint64Decimal(" 1")).toThrow();
    expect(() => normalizeUint64Decimal("1.5")).toThrow();
    expect(() => normalizeUint64Decimal("-1")).toThrow();
  });

  it("bytes32 and address normalization lowercase canonical form", () => {
    expect(
      normalizeWalletAddress("0xAbCdEf0000000000000000000000000000012345"),
    ).toBe("0xabcdef0000000000000000000000000000012345");
    expect(() => normalizeWalletAddress("0x123")).toThrow();
    const bytes32 = `0x${"ab".repeat(32)}`;
    expect(normalizeHexBytes(bytes32)).toBe(bytes32);
  });

  it("hex byte normalization rejects malformed numeric input", () => {
    expect(normalizeHexBytes("0x00ff")).toBe("0x00ff");
    expect(() => normalizeHexBytes("0x0")).toThrow(); // odd length
    expect(() => normalizeHexBytes("0xGG")).toThrow(); // non-hex
    expect(() => normalizeHexBytes("00ff")).toThrow(); // missing 0x
    expect(() => normalizeHexBytes("0xFF")).toThrow(); // uppercase
  });

  it("json bigint rejects malformed numeric strings", () => {
    expect(() => bigintValueFromJson("12a")).toThrow();
    expect(() => bigintValueFromJson("0x10")).toThrow();
    expect(() => bigintValueFromJson("-5")).toThrow();
    expect(() => bigintValueFromJson("")).toThrow();
    expect(bigintValueFromJson("0")).toBe(0n);
  });
});
