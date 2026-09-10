import {
  MONSTERFACTORYASC_ABI,
  MONSTERMARKETPLACE_ABI,
  MONSTERNFT_ABI,
} from "@origin-duel/contracts-abi";
import {
  normalizeWalletAddress,
  type WalletAddress,
} from "@origin-duel/domain";
import { getContract, type PublicClient } from "viem";

/**
 * Generated-ABI consumption boundary (M03-T05 export). The
 * @origin-duel/contracts-abi package is the only ABI source; these helpers
 * bind a deployed address to that generated ABI via Viem's getContract.
 * Addresses are always caller-injected deployment config, never hardcoded.
 */
export function getMonsterNft(client: PublicClient, address: string) {
  return getContract({
    address: address as WalletAddress,
    abi: MONSTERNFT_ABI,
    client,
  });
}

export function getMonsterFactory(client: PublicClient, address: string) {
  return getContract({
    address: address as WalletAddress,
    abi: MONSTERFACTORYASC_ABI,
    client,
  });
}

export function getMonsterMarketplace(client: PublicClient, address: string) {
  return getContract({
    address: address as WalletAddress,
    abi: MONSTERMARKETPLACE_ABI,
    client,
  });
}

// Re-export the shared address normalizer so chain-layer callers have one
// canonical lowercase-address entry point.
export {
  MONSTERFACTORYASC_ABI,
  MONSTERMARKETPLACE_ABI,
  MONSTERNFT_ABI,
  normalizeWalletAddress,
};
