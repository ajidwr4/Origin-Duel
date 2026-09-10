import { createPublicClient, http } from "viem";
import { creditcoinTestnet, sepoliaChain } from "./chains.ts";

/**
 * Explicit PublicClient creation boundaries (tech-stack §8.1). Each caller
 * injects its own transport URL — no hidden singleton and no hardcoded
 * provider URL or API key. The transport is read-only plumbing; it is never
 * application authority (chain truth stays with Factory/NFT/Marketplace).
 */
export function createSepoliaPublicClient(rpcUrl: string) {
  return createPublicClient({
    chain: sepoliaChain,
    transport: http(rpcUrl),
  });
}

export function createCreditcoinPublicClient(rpcUrl: string) {
  return createPublicClient({
    chain: creditcoinTestnet,
    transport: http(rpcUrl),
  });
}

export type SepoliaPublicClient = ReturnType<typeof createSepoliaPublicClient>;
export type CreditcoinPublicClient = ReturnType<
  typeof createCreditcoinPublicClient
>;
