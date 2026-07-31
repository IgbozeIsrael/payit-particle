require('dotenv').config();
const https = require('https');

const LOCK_MINUTES = 15;
const PLATFORM_MARGIN = 0.0075; // 0.75% platform margin
const FALLBACK_NGN_PER_USDC = 1420;

// Nuvion request helper
function requestNuvion(endpoint, retries = 3) {
  return new Promise((resolve, reject) => {
    const makeRequest = (attempt) => {
      try {
        const API_KEY = process.env.NUVION_API_KEY;
        if (!API_KEY) {
          return reject(new Error('NUVION_API_KEY not configured'));
        }

        const url = new URL(`https://api.nuvion.dev${endpoint}`);
        const options = {
          hostname: url.hostname,
          port: 443,
          path: url.pathname + url.search,
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        };

        const req = https.request(options, (res) => {
          let raw = '';
          res.on('data', (chunk) => { raw += chunk; });
          res.on('end', () => {
            try {
              const parsed = raw ? JSON.parse(raw) : {};
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(parsed);
              } else {
                reject(new Error(`Nuvion API ${res.statusCode}: ${parsed.message || raw}`));
              }
            } catch (err) {
              reject(new Error(`Parse error: ${err.message}`));
            }
          });
        });

        req.on('error', (err) => {
          if ((err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') && attempt < retries) {
            console.warn(`[FX] Nuvion request failed, retrying (${attempt}/${retries})...`);
            setTimeout(() => makeRequest(attempt + 1), 400 * attempt);
          } else {
            reject(err);
          }
        });

        req.end();
      } catch (err) {
        reject(err);
      }
    };
    makeRequest(1);
  });
}

class FxService {
  constructor() {
    this.cache = { rate: null, fetchedAt: 0, margin: PLATFORM_MARGIN };
    this.ratesCache = new Map();
    this.cacheTtlMs = 5 * 60 * 1000;
  }

  /**
   * Dynamically fetch live rate for any currency from Nuvion API
   */
  async getLiveRate(currency = 'NGN') {
    const cur = currency.toUpperCase();
    if (cur === 'USD' || cur === 'USDT' || cur === 'USDC') {
      return 1.0;
    }

    const cached = this.ratesCache.get(cur);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTtlMs) {
      return cached.rate;
    }

    try {
      console.log(`[FX] Fetching live ${cur}/USD rate from Nuvion API...`);
      const res = await requestNuvion(`/rates?currencies=${cur}`);
      const baseRate = Number(res?.data?.[cur] || res?.[cur]);

      if (baseRate && !isNaN(baseRate)) {
        const rateWithMargin = Number((baseRate * (1 + PLATFORM_MARGIN)).toFixed(4));
        this.ratesCache.set(cur, { rate: rateWithMargin, baseRate, fetchedAt: Date.now() });
        return rateWithMargin;
      }
    } catch (err) {
      console.warn(`[FX] Nuvion live rate endpoint unavailable for ${cur}: ${err.message}`);
    }

    // Dynamic fallback calculation if Nuvion API endpoint is offline
    if (cur === 'NGN') return this.fetchNuvionRate();
    if (cur === 'GBP') return 0.79;
    if (cur === 'EUR') return 0.92;
    if (cur === 'KES') return 129.5;
    if (cur === 'ZAR') return 18.2;
    if (cur === 'GHS') return 15.85;
    if (cur === 'CAD') return 1.385;
    if (cur === 'AED') return 3.67;

    return 1.0;
  }

  /**
   * Fetch NGN/USD rate from Nuvion and add platform margin
   */
  async fetchNuvionRate() {
    const now = Date.now();
    if (this.cache.rate && now - this.cache.fetchedAt < this.cacheTtlMs) {
      return this.cache.rate;
    }

    try {
      console.log('[FX] Fetching fresh rate from Nuvion API...');
      let baseNgnRate = FALLBACK_NGN_PER_USDC;

      try {
        const rateRes = await requestNuvion('/rates?currencies=NGN');
        if (rateRes?.data?.NGN) {
          baseNgnRate = Number(rateRes.data.NGN);
          console.log(`[FX] Got NGN rate from Nuvion: ${baseNgnRate}`);
        }
      } catch (rErr) {
        console.warn('[FX] Rates endpoint not available, using fallback');
      }

      const rateWithMargin = Number((baseNgnRate * (1 + PLATFORM_MARGIN)).toFixed(2));
      this.cache = {
        rate: rateWithMargin,
        baseRate: baseNgnRate,
        fetchedAt: now,
        margin: PLATFORM_MARGIN
      };

      return rateWithMargin;
    } catch (err) {
      console.warn('[FX] Failed to fetch Nuvion rate:', err.message);
      const fallbackWithMargin = Number((FALLBACK_NGN_PER_USDC * (1 + PLATFORM_MARGIN)).toFixed(2));
      this.cache = {
        rate: fallbackWithMargin,
        baseRate: FALLBACK_NGN_PER_USDC,
        fetchedAt: now,
        margin: PLATFORM_MARGIN
      };
      return fallbackWithMargin;
    }
  }

  async fetchMarketRate() {
    return this.fetchNuvionRate();
  }

  async createRateLock(db, { userId, invoiceId, fromCurrency = 'USDC', toCurrency = 'NGN' }) {
    const marketRate = await this.fetchMarketRate();
    const lockId = `fx_${Date.now().toString(36)}`;
    const expiresAt = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();

    db.createFxRateLock({
      lockId,
      userId,
      invoiceId,
      fromCurrency,
      toCurrency,
      rate: marketRate,
      expiresAt
    });

    return { lockId, rate: marketRate, fromCurrency, toCurrency, expiresAt, validMinutes: LOCK_MINUTES };
  }

  formatRateLine(lock) {
    if (!lock) return '';
    const expires = new Date(lock.expires_at || lock.expiresAt).toLocaleTimeString();
    return `💱 FX Lock: 1 ${lock.from_currency || lock.fromCurrency} = ${Number(lock.rate).toFixed(2)} ${lock.to_currency || lock.toCurrency} (valid until ${expires})`;
  }

  async getUsdcNgnRate() {
    return this.fetchMarketRate();
  }

  getRate() {
    if (this.cache.rate && Date.now() - this.cache.fetchedAt < this.cacheTtlMs) {
      return this.cache.rate;
    }
    return Number((FALLBACK_NGN_PER_USDC * (1 + PLATFORM_MARGIN)).toFixed(2));
  }

  convert(amount, rate, fromCurrency, toCurrency) {
    if (fromCurrency === 'USDC' && toCurrency === 'NGN') {
      return Number((amount * rate).toFixed(2));
    }
    if (fromCurrency === 'NGN' && toCurrency === 'USDC') {
      return Number((amount / rate).toFixed(6));
    }
    return amount;
  }
}

module.exports = new FxService();
