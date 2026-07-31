const axios = require('axios');

const USER_DISPLAY_APY_CAP = 10;

/**
 * Scan stablecoin yield opportunities (DefiLlama) and apply PayIT fee model.
 * Users see up to 10% APY; platform keeps any yield above 10%.
 */
class YieldService {
  constructor() {
    this.cache = { pools: null, fetchedAt: 0 };
    this.cacheTtlMs = 15 * 60 * 1000;
  }

  async fetchStablecoinPools() {
    const now = Date.now();
    if (this.cache.pools && now - this.cache.fetchedAt < this.cacheTtlMs) {
      return this.cache.pools;
    }

    try {
      const { data } = await axios.get('https://yields.llama.fi/pools', { timeout: 12000 });
      const pools = (data.data || [])
        .filter((pool) => {
          const symbol = String(pool.symbol || '').toUpperCase();
          const chain = String(pool.chain || '').toLowerCase();
          const tvl = Number(pool.tvlUsd || 0);
          const apy = Number(pool.apy || 0);
          const isStable =
            symbol.includes('USDC') ||
            symbol.includes('USDT') ||
            symbol.includes('DAI') ||
            symbol.includes('EURC');
          const isRelevantChain =
            chain.includes('arbitrum') ||
            chain.includes('ethereum') ||
            chain.includes('base');
          return isStable && isRelevantChain && tvl >= 500000 && apy > 0 && apy < 50;
        })
        .sort((a, b) => Number(b.apy) - Number(a.apy));

      this.cache = { pools, fetchedAt: now };
      return pools;
    } catch (error) {
      console.warn('[Yield] DefiLlama fetch failed, using fallback:', error.message);
      return [
        {
          pool: 'payit-fallback-usdc',
          project: 'Aave',
          chain: 'Arbitrum',
          symbol: 'USDC',
          apy: 8.4,
          tvlUsd: 1000000
        },
        {
          pool: 'payit-fallback-usdc-v2',
          project: 'Compound',
          chain: 'Arbitrum',
          symbol: 'USDC',
          apy: 11.2,
          tvlUsd: 800000
        }
      ];
    }
  }

  async getBestStablecoinYield() {
    const pools = await this.fetchStablecoinPools();
    if (!pools.length) {
      return {
        marketApy: 5,
        userApy: 5,
        platformApy: 0,
        pool: null
      };
    }

    const best = pools[0];
    const marketApy = Number(best.apy);
    const userApy = marketApy >= USER_DISPLAY_APY_CAP ? USER_DISPLAY_APY_CAP : marketApy;
    const platformApy = marketApy > USER_DISPLAY_APY_CAP ? marketApy - USER_DISPLAY_APY_CAP : 0;

    return {
      marketApy,
      userApy,
      platformApy,
      pool: {
        id: best.pool,
        project: best.project,
        chain: best.chain,
        symbol: best.symbol,
        tvlUsd: best.tvlUsd
      }
    };
  }

  /**
   * Estimate annual yield split for a principal amount.
   */
  estimateYieldSplit(principal, marketApy = null) {
    const apy = marketApy ?? USER_DISPLAY_APY_CAP;
    const userApy = apy >= USER_DISPLAY_APY_CAP ? USER_DISPLAY_APY_CAP : apy;
    const platformApy = apy > USER_DISPLAY_APY_CAP ? apy - USER_DISPLAY_APY_CAP : 0;
    const userAnnual = principal * (userApy / 100);
    const platformAnnual = principal * (platformApy / 100);
    return { userApy, platformApy, userAnnual, platformAnnual };
  }
}

module.exports = new YieldService();
