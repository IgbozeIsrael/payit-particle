/**
 * Chain Configuration Registry
 * -----------------------------
 * Central registry of all supported blockchain networks for PayIT.
 *
 * Each entry includes:
 *   - chainId          : EIP-155 chain ID
 *   - name             : Human-readable name
 *   - rpcUrl           : Public RPC endpoint
 *   - explorerUrl      : Block explorer base URL
 *   - usdcAddress      : USDC ERC-20 contract on this chain
 *   - nativeCurrency   : { name, symbol, decimals }
 *   - magicNetworkName : Magic.link's network identifier
 *   - isTestnet        : true for testnets
 *   - gasEstimate      : Rough gas cost in USD cents for a USDC transfer (for UI hints)
 */

const CHAINS = {
  // ── Testnets ──────────────────────────────────────────────────────────────
  arbitrumSepolia: {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    shortName: 'Arb Sepolia',
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc',
    explorerUrl: 'https://sepolia.arbiscan.io',
    usdcAddress: '0x75FAf114eAFb1bdBE23224eC7530404B110a4235',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    magicNetworkName: 'arbitrum_sepolia',
    isTestnet: true,
    gasEstimate: 0,   // Free (testnet)
    color: '#12AAFF',
    icon: '🔷',
  },

  // ── Mainnets ──────────────────────────────────────────────────────────────
  arbitrum: {
    chainId: 42161,
    name: 'Arbitrum One',
    shortName: 'Arbitrum',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    magicNetworkName: 'arbitrum',
    isTestnet: false,
    gasEstimate: 1,   // ~$0.01
    color: '#12AAFF',
    icon: '🔷',
  },

  polygon: {
    chainId: 137,
    name: 'Polygon',
    shortName: 'Polygon',
    rpcUrl: 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    usdcAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    magicNetworkName: 'polygon',
    isTestnet: false,
    gasEstimate: 0,   // Nearly free
    color: '#8247E5',
    icon: '💜',
  },

  base: {
    chainId: 8453,
    name: 'Base',
    shortName: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    magicNetworkName: 'base',
    isTestnet: false,
    gasEstimate: 0,   // Nearly free
    color: '#0052FF',
    icon: '🔵',
  },

  bnb: {
    chainId: 56,
    name: 'BNB Smart Chain',
    shortName: 'BNB Chain',
    rpcUrl: 'https://bsc-dataseed1.binance.org',
    explorerUrl: 'https://bscscan.com',
    usdcAddress: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    magicNetworkName: 'bsc',
    isTestnet: false,
    gasEstimate: 1,   // ~$0.01
    color: '#F0B90B',
    icon: '🟡',
  },

  solana: {
    chainId: 101,
    name: 'Solana',
    shortName: 'Solana',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    explorerUrl: 'https://explorer.solana.com',
    usdcAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    nativeCurrency: { name: 'Solana', symbol: 'SOL', decimals: 9 },
    magicNetworkName: 'solana',
    isTestnet: false,
    gasEstimate: 0.1,
    color: '#14F195',
    icon: '☀️',
    isNonEvm: true,
  },
};


/**
 * Default chain (used by the checkout page and sweep logic).
 * Can be overridden by PAYIT_DEFAULT_CHAIN env variable.
 */
const DEFAULT_CHAIN_KEY = process.env.PAYIT_DEFAULT_CHAIN || 'arbitrumSepolia';
const DEFAULT_CHAIN = CHAINS[DEFAULT_CHAIN_KEY] || CHAINS.arbitrumSepolia;

/**
 * Get chain config by chainId.
 * Returns null if chain is not supported.
 */
function getChainById(chainId) {
  return Object.values(CHAINS).find(c => c.chainId === Number(chainId)) || null;
}

/**
 * Get chain config by key.
 */
function getChain(key) {
  return CHAINS[key] || null;
}

/**
 * Returns the list of chains to show in the checkout chain selector.
 * In testnet/development mode: only testnets.
 * In production mode: only mainnets.
 */
function getCheckoutChains() {
  const isProduction = process.env.NODE_ENV === 'production';
  return Object.entries(CHAINS)
    .filter(([, c]) => isProduction ? !c.isTestnet : c.isTestnet)
    .map(([key, c]) => ({ key, ...c }));
}

module.exports = {
  CHAINS,
  DEFAULT_CHAIN,
  DEFAULT_CHAIN_KEY,
  getChain,
  getChainById,
  getCheckoutChains,
};
