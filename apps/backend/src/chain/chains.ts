import {
  CREDITCOIN_TESTNET_CHAIN_ID,
  SEPOLIA_CHAIN_ID,
} from "@origin-duel/domain";
import { defineChain } from "viem";
import { sepolia } from "viem/chains";

/**
 * Creditcoin Testnet is not shipped by Viem, so it gets a frozen custom
 * defineChain(). The RPC URL is injected at client-creation time
 * (clients.ts) — never hardcoded here: it is deployment/environment config
 * (tech-stack §8.3). Explorer/currency fields are display metadata only,
 * not application authority.
 */
export const creditcoinTestnet = defineChain({
  id: CREDITCOIN_TESTNET_CHAIN_ID,
  name: "Creditcoin Testnet",
  nativeCurrency: {
    name: "Creditcoin Test Token",
    symbol: "CTC",
    decimals: 18,
  },
  // ponytail: display-only metadata; relabel at deployment if official
  // docs rename the test token (tech-stack §8.3).
  rpcUrls: {
    default: { http: [] },
  },
  testnet: true,
});

export const sepoliaChain = sepolia;

if (sepoliaChain.id !== SEPOLIA_CHAIN_ID) {
  throw new Error("viem sepolia chain id drifted from 11155111");
}

export const SEPOLIA_CHAIN_ID_EXACT = sepoliaChain.id;
export const CREDITCOIN_CHAIN_ID_EXACT = creditcoinTestnet.id;
