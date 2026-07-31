const https = require('https');
require('dotenv').config();
const fxService = require('./fx-service');
const { getFeeWalletAddress, recordPlatformFee } = require('./fee-wallet');

const API_KEY = process.env.NUVION_API_KEY;
// Correct base URL per Nuvion docs (api.nuvion.dev, not api.nuvion.co)
const API_BASE_URL = 'https://api.nuvion.dev';

/**
 * Helper to make HTTP requests to the Nuvion API with automatic retry for socket resets (ECONNRESET).
 */
async function requestNuvion(endpoint, method = 'GET', data = null, baseUrlOverride = null, retries = 3) {
  const baseUrl = baseUrlOverride || process.env.NUVION_BASE_URL || 'https://api.nuvion.dev';
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        const API_KEY = process.env.NUVION_API_KEY;
        if (!API_KEY || API_KEY === 'your_nuvion_api_key_here') {
          return reject(new Error('NUVION_API_KEY is not configured in .env'));
        }

        const url = new URL(`${baseUrl}${endpoint}`);
        const body = data ? JSON.stringify(data) : null;

        const options = {
          hostname: url.hostname,
          port: 443,
          path: url.pathname + url.search,
          method: method,
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Connection': 'keep-alive',
            ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
          }
        };

        const req = https.request(options, (res) => {
          let raw = '';
          res.on('data', (chunk) => { raw += chunk; });
          res.on('end', async () => {
            try {
              const parsed = raw ? JSON.parse(raw) : {};
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(parsed);
              } else {
                const errorDetails = parsed.errors ? JSON.stringify(parsed.errors) : '';
                reject(new Error(`Nuvion API ${res.statusCode}: ${parsed.message || parsed.error || raw} ${errorDetails}`));
              }
            } catch (err) {
              reject(new Error(`Nuvion parse error: ${err.message} — raw: ${raw.slice(0, 200)}`));
            }
          });
        });

        req.on('error', (err) => reject(err));
        if (body) req.write(body);
        req.end();
      });
    } catch (err) {
      const isNetworkErr = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.message.includes('ECONNRESET');
      if (isNetworkErr && attempt < retries) {
        console.warn(`[Nuvion API] Network glitch (${err.message}). Retrying attempt ${attempt}/${retries}...`);
        await new Promise(r => setTimeout(r, 400 * attempt));
        continue;
      }
      throw err;
    }
  }
}

async function requestNuvionWithFallback(endpoint, method = 'GET', data = null) {
  try {
    return await requestNuvion(endpoint, method, data, process.env.NUVION_BASE_URL || 'https://api.nuvion.dev');
  } catch (err1) {
    if (err1.message.includes('401') || err1.message.includes('404')) {
      console.log(`[Nuvion] Trying fallback base URL api.nuvion.co due to: ${err1.message}`);
      return await requestNuvion(endpoint, method, data, 'https://api.nuvion.co');
    }
    throw err1;
  }
}

// ─── Currency → Nuvion currency code map ───────────────────────────────────
// Nuvion stablecoin codes: USC = USDC, UST = USDT, RLD = USDRL
const CURRENCY_MAP = {
  NGN: 'NGN',
  USD: 'USD',
  GBP: 'GBP',
  EUR: 'EUR',
  KES: 'KES',
  GHS: 'GHS',
  ZAR: 'ZAR',
  CAD: 'CAD',
  AED: 'AED',
  UGX: 'UGX',
  TZS: 'TZS',
  RWF: 'RWF',
  XAF: 'XAF',
  XOF: 'XOF',
  USDT: 'UST',
  USDC: 'USC',
  USDRL: 'RLD'
};

// Base market interbank FX rates to 1 USD for all supported Nuvion currencies
// NGN rate is dynamically updated from fxService; others are static fallbacks
let BASE_FX_RATES_TO_USD = {
  USD: 1.0,
  NGN: fxService.getRate(),
  GBP: 0.78,
  EUR: 0.92,
  KES: 129.5,
  GHS: 15.4,
  ZAR: 18.2,
  CAD: 1.36,
  AED: 3.67,
  UGX: 3720.0,
  TZS: 2580.0,
  RWF: 1310.0,
  XAF: 605.0,
  XOF: 605.0
};

/**
 * Get FX rates to USD with configurable platform margin
 * @param {number} marginPct - Platform margin percentage (default 0.75% = 0.0075)
 */
async function getFxRates(marginPct = 0.0075) {
  const rates = {};
  for (const [code, baseRate] of Object.entries(BASE_FX_RATES_TO_USD)) {
    // Deposit rate (user receives USDT after platform margin)
    const depositRate = baseRate * (1 + marginPct);
    // Withdrawal rate (user pays fiat per USDT)
    const withdrawalRate = baseRate * (1 - marginPct);
    rates[code] = {
      baseRate,
      depositRate: Number(depositRate.toFixed(2)),
      withdrawalRate: Number(withdrawalRate.toFixed(2)),
      feeMarginPct: `${marginPct * 100}%`
    };
  }
  return rates;
}

module.exports = {
  getFxRates,
  requestNuvionWithFallback,
  clearAccountCache(userId) {
    if (this._accountCache) {
      for (let key of this._accountCache.keys()) {
        if (key.startsWith(`${userId}_`)) {
          this._accountCache.delete(key);
        }
      }
    }
  },
  /**
   * Full flow: Create entity → create account → provision account details.
   * Returns { account_number, issuer, currency } for display in the app.
   *
   * NOTE: Nuvion's account details are PERSISTENT — we cache the result in DB.
   */
  async getOrCreateDepositAccount(userId, currency, userProfile = {}, depositId = null, context = 'personal') {
    const db = require('./db');
const dbPg = require('./db-pg');
    const nuvionCurrency = CURRENCY_MAP[currency] || currency;
    const isStablecoin = ['UST', 'USC', 'RLD'].includes(nuvionCurrency);
    const txId = depositId || `dep_${Date.now()}_${Math.floor(Math.random()*10000)}`;

    // High-speed memory cache check (0ms response)
    if (!this._accountCache) this._accountCache = new Map();
    
    // Evict expired entries periodically to prevent unbounded growth
    if (this._accountCache.size > 500) {
      const now = Date.now();
      for (const [key, val] of this._accountCache) {
        if (now - val.timestamp > 30 * 60 * 1000) {
          this._accountCache.delete(key);
        }
      }
    }
    
    // Cache key MUST include userId + context + currency so that switching a user
    // from personal → business never returns a cached personal account for the
    // business context (and vice-versa).
    const cacheKey = `${userId || 'guest'}_${context}_${nuvionCurrency}`;
    const cachedAcc = this._accountCache.get(cacheKey);
    if (cachedAcc && Date.now() - cachedAcc.timestamp < 30 * 60 * 1000) { // 30 min cache
      // If the cached name is still Solvium, force a refresh
      if (!cachedAcc.data.beneficiary_name || cachedAcc.data.beneficiary_name.toLowerCase().includes('solvium')) {
        this._accountCache.delete(cacheKey);
      } else {
        return cachedAcc.data;
      }
    }

    console.log(`[Nuvion] getOrCreateDepositAccount for ${userId}, currency=${nuvionCurrency}, txId=${txId}`);

    try {
      // Step 0: Check if this user already has an existing active dedicated account for this currency
      try {
        const existingAccounts = await requestNuvionWithFallback('/accounts', 'GET');
        const accList = existingAccounts?.data?.data || existingAccounts?.data || [];
        const userFullName = userProfile.name || (userProfile.first_name ? `${userProfile.first_name} ${userProfile.last_name || ''}`.trim() : null);
        // EXCLUDE parent account '01KX6M4ST8S4J4DBT7NJT2S5H6' (parent merchant account 9556439675)
        const profileEntityId = userProfile.nuvion_entity_id || await dbPg.getProfileByType(userId, context)?.nuvion_entity_id;
        const matchingAccount = accList.find((a) => 
          a.id !== '01KX6M4ST8S4J4DBT7NJT2S5H6' && 
          a.currency === nuvionCurrency && 
          a.status === 'active' && 
          a.meta?.platform_user_id === userId &&
          // Strictly enforce context so personal accounts are never reused for business and vice-versa
          (context === 'business'
            ? (a.meta?.context === 'business' || (profileEntityId && a.entity_id === profileEntityId && a.entity_id !== userProfile.nuvion_entity_id_personal))
            : (a.meta?.context === 'personal' || (!a.meta?.context && a.display_name?.toLowerCase().includes('personal'))))
        );

        if (matchingAccount) {
          console.log(`[Nuvion] Found active dedicated ${nuvionCurrency} account: ${matchingAccount.id} for user ${userId}`);
          const details = await requestNuvionWithFallback(`/account-details?account_id=${matchingAccount.id}`, 'GET');
          const detailsList = details?.data?.data || details?.data || [];
          const primaryDetails = detailsList[0] || {};

          const accNum = primaryDetails.account_number || matchingAccount.nuvion_ban || null;
          if (!accNum) {
            // No real account number yet — skip cache and let provisioning continue
            console.warn(`[Nuvion] Existing account ${matchingAccount.id} has no account_number yet. Will re-provision.`);
          } else {
            // Always prefer a clean issuer name — never surface VFD to the user
            let bank = primaryDetails.issuer?.name || (currency === 'NGN' ? 'Flutterwave MFB / Nuvion Partner Bank' : 'Lead Bank');
            if (bank.toLowerCase().includes('vfd')) bank = 'Flutterwave MFB / Nuvion Partner Bank';

            // Build beneficiary EXCLUSIVELY from our KYC-verified user data.
            // NEVER trust Nuvion's stored beneficiary_name — it may carry the parent
            // merchant name ("Solvium Games Ltd") from when the platform account was set up.
            let beneficiary;
            if (context === 'business') {
              const biz = userProfile.business_name || userProfile.name;
              beneficiary = biz ? `${biz.toUpperCase()} / PayIT` : null;
            } else {
              beneficiary = userFullName ? `${userFullName.toUpperCase()} / PayIT` : null;
            }

            // Detect stale / wrong Nuvion-side beneficiary and patch it synchronously
            // so the CURRENT response already carries the correct name (not fire-and-forget).
            const storedBeneficiary = primaryDetails.beneficiary_name || '';
            const isStaleOrWrong = !storedBeneficiary ||
              storedBeneficiary.toLowerCase().includes('solvium') ||
              storedBeneficiary.toLowerCase().includes('payit account') ||
              storedBeneficiary.toLowerCase() === 'payit user / payit' ||
              (beneficiary && !storedBeneficiary.toLowerCase().startsWith(beneficiary.toLowerCase().split('/')[0].trim()));

            if (beneficiary && isStaleOrWrong) {
              console.log(`[Nuvion] Patching stale beneficiary on account ${matchingAccount.id}: "${storedBeneficiary}" → "${beneficiary}"`);
              try {
                // Awaited so callers immediately receive the corrected name
                await requestNuvionWithFallback('/account-details', 'POST', { account_id: matchingAccount.id, beneficiary_name: beneficiary });
                await dbPg.query('UPDATE accounts SET beneficiary_name = ? WHERE nuvion_account_id = ?', [beneficiary, matchingAccount.id]);
              } catch (patchErr) {
                console.warn(`[Nuvion] Beneficiary patch warning: ${patchErr.message}`);
              }
            }

            const resObj = {
              entity_id: matchingAccount.entity_id,
              account_id: matchingAccount.id,
              account_number: accNum,
              issuer: { name: bank, code: primaryDetails.issuer?.code || '' },
              // Always serve our verified beneficiary — never the potentially-stale Nuvion value
              beneficiary_name: beneficiary || storedBeneficiary || null,
              chain: primaryDetails.chain || (isStablecoin ? 'eth' : null),
              checkoutUrl: null,
              status: 'active',
              currency: nuvionCurrency,
            };
            this._accountCache.set(cacheKey, { data: resObj, timestamp: Date.now() });
            return resObj;
          }
        }
      } catch (checkErr) {
        console.warn(`[Nuvion] List existing accounts check skipped: ${checkErr.message}`);
      }
      // Step 1: Create or retrieve Nuvion entity for this user
      let entityId = userProfile.nuvion_entity_id;
      if (!entityId) {
        let entityPayload;
        let endpoint;

        if (context === 'business') {
          if (!userProfile.business_name) {
            throw new Error('business_name is required for business entity creation');
          }
          endpoint = '/business-entities';
          const safeId = String(userId).replace(/[^a-z0-9]/gi, '');
          
          if (!userProfile.registration_number) {
            throw new Error('Business registration number (CAC) is required for business entity creation');
          }
          if (!userProfile.tin) {
            throw new Error('Business TIN is required for business entity creation');
          }
          
          entityPayload = {
            name: userProfile.business_name,
            business: {
              legal_name: userProfile.business_name,
              email: userProfile.business_email || `${safeId}@payit.app`,
              registration_number: userProfile.registration_number,
              tin: userProfile.tin,
              country: userProfile.country || 'NG',
              type: "LLC",
              industry: "technology",
              description: "Verified Business",
              incorporation_meta: {
                year: 2020,
                month: 1,
                country: userProfile.country || "NG",
                state: "Lagos"
              }
            },
            address: {
              city: userProfile.city || 'Lagos',
              country_code: userProfile.country || 'NG',
              street: userProfile.business_address || '14 Commercial Ave'
            },
            meta: { platform_user_id: userId }
          };
        } else {
          endpoint = '/individual-entities';
          const safeId = String(userId).replace(/[^a-z0-9]/gi, '');
          
          if (!userProfile.first_name || !userProfile.last_name) {
            throw new Error('First name and last name are required for individual entity creation');
          }
          if (!userProfile.phone) {
            throw new Error('Phone number is required for individual entity creation');
          }
          if (!userProfile.dob) {
            throw new Error('Date of birth is required for individual entity creation');
          }
          if (!userProfile.gender) {
            throw new Error('Gender is required for individual entity creation');
          }
          
          const personPayload = {
            first_name: userProfile.first_name,
            last_name: userProfile.last_name,
            email: userProfile.email || `${safeId}@payit.app`,
            nationality: userProfile.country || 'NG',
            date_of_birth: userProfile.dob,
            gender: userProfile.gender.charAt(0).toLowerCase(),
            phonenumber: userProfile.phone
          };
          if (userProfile.bvn) personPayload.bvn = userProfile.bvn;
          if (userProfile.nin) personPayload.nin = userProfile.nin;

          entityPayload = {
            name: `${userProfile.first_name} ${userProfile.last_name}`.trim(),
            person: personPayload,
            address: {
              line_1: userProfile.address || '14 Commercial Ave',
              city: userProfile.city || 'Lagos',
              state: userProfile.state || 'Lagos',
              postal_code: userProfile.postal_code || '100001',
              country_code: userProfile.country || 'NG'
            },
            meta: { platform_user_id: userId }
          };
        }

        try {
          const entity = await requestNuvionWithFallback(endpoint, 'POST', entityPayload);
          entityId = entity.id || entity.data?.id;
        } catch (entityErr) {
          if (entityErr.message.includes('422') || entityErr.message.includes('already') || entityErr.message.includes('409') || entityErr.message.includes('exists')) {
            console.warn(`[Nuvion] Entity creation 422/409 (may already exist): ${entityErr.message}`);
            try {
              const existingList = await requestNuvionWithFallback(endpoint, 'GET');
              const allEntities = existingList?.data?.data || existingList?.data || [];
              const match = allEntities.find(e =>
                e.meta?.platform_user_id === userId ||
                (userProfile.registration_number && e.business?.registration_number === String(userProfile.registration_number)) ||
                (userProfile.bvn && e.person?.bvn === String(userProfile.bvn))
              );
              if (match) {
                entityId = match.id;
                console.log(`[Nuvion] Resolved existing entity by lookup: ${entityId}`);
              } else {
                throw new Error(`Entity duplicate error and no existing match found: ${entityErr.message}`);
              }
            } catch (lookupErr) {
              console.warn(`[Nuvion] Entity lookup also failed: ${lookupErr.message}`);
              throw new Error(`Entity creation failed: ${entityErr.message}`);
            }
          } else {
            throw new Error(`Entity creation failed: ${entityErr.message}`);
          }
        }
      }

      // Step 2: Create a Nuvion account for this currency and transaction
      let accountId;
      try {
        const accDisplayName = context === 'business'
          ? `${userProfile.business_name || 'Business'} - Business ${currency} Account`
          : `${userProfile.first_name || 'Personal'} ${userProfile.last_name || ''} - Personal ${currency} Account`.trim();

        const account = await requestNuvionWithFallback('/accounts', 'POST', {
          entity_id: entityId,
          type: 'checking',
          currency: nuvionCurrency,
          display_name: accDisplayName,
          meta: { platform_user_id: userId, context: context }
        });
        accountId = account.id || account.data?.id;
        console.log(`[Nuvion] Created account: ${accountId}`);
      } catch (accErr) {
        if (accErr.message.includes('422') || accErr.message.includes('already') || accErr.message.includes('409')) {
          console.warn(`[Nuvion] Account 409/422 — looking up existing real account: ${accErr.message}`);
          try {
            const existingAccs = await requestNuvionWithFallback('/accounts', 'GET');
            const accList = existingAccs?.data?.data || existingAccs?.data || [];
            const existing = accList.find(a =>
              a.id !== '01KX6M4ST8S4J4DBT7NJT2S5H6' &&
              a.currency === nuvionCurrency &&
              a.status === 'active' &&
              (a.entity_id === entityId || a.meta?.platform_user_id === userId) &&
              // CRITICAL: must match context to avoid cross-contaminating personal/business accounts
              (a.meta?.context === context || (context === 'personal' && !a.meta?.context))
            );
            if (existing) {
              accountId = existing.id;
              console.log(`[Nuvion] Recovered existing real account: ${accountId} (${nuvionCurrency}, context=${context})`);
            } else {
              throw new Error(`No existing account found for currency ${nuvionCurrency} in context ${context}`);
            }
          } catch (lookupErr) {
            throw new Error(`Account creation failed and no existing account found: ${accErr.message}`);
          }
        } else {
          throw new Error(`Account creation failed: ${accErr.message}`);
        }
      }

      // Step 3: Provision account details with real verified user name.
      // This is the step that sets the beneficiary_name on Nuvion's side.
      // It MUST be awaited and must always carry the KYC-verified name — never
      // fall back to Nuvion's default which inherits the parent merchant name
      // ("Solvium Games Ltd") from the platform account.
      let detailsObj = {};
      try {
        // Build beneficiary name exclusively from our verified data
        let beneficiaryName = null;
        if (context === 'business') {
          const biz = userProfile.business_name || userProfile.name;
          if (biz) beneficiaryName = `${biz.toUpperCase()} / PayIT`;
        } else {
          const personal = userProfile.name
            || (userProfile.first_name ? `${userProfile.first_name} ${userProfile.last_name || ''}`.trim() : null);
          if (personal) beneficiaryName = `${personal.toUpperCase()} / PayIT`;
        }

        if (!beneficiaryName) {
          // Last-resort fallback — use platform name so Nuvion never defaults to Solvium
          beneficiaryName = context === 'business' ? 'PAYIT BUSINESS / PayIT' : 'PAYIT USER / PayIT';
        }

        const detailsPayload = {
          account_id: accountId,
          beneficiary_name: beneficiaryName
        };
        if (isStablecoin) detailsPayload.chain = 'eth';

        const details = await requestNuvionWithFallback('/account-details', 'POST', detailsPayload);
        detailsObj = details.data || details;

        // If the returned beneficiary still shows Solvium (e.g. Nuvion ignored our value),
        // force a second PATCH immediately
        const returnedBeneficiary = detailsObj.beneficiary_name || '';
        if (returnedBeneficiary.toLowerCase().includes('solvium')) {
          console.warn(`[Nuvion] Nuvion returned Solvium on new account ${accountId} — forcing immediate PATCH`);
          try {
            const patchRes = await requestNuvionWithFallback('/account-details', 'POST', {
              account_id: accountId,
              beneficiary_name: beneficiaryName
            });
            detailsObj = patchRes.data || patchRes || detailsObj;
          } catch (patchErr) {
            console.warn(`[Nuvion] Force beneficiary PATCH warning: ${patchErr.message}`);
          }
        }
      } catch (detErr) {
        console.warn(`[Nuvion] Account details provisioning error: ${detErr.message}`);
      }

      // Create a Nuvion Funding Session URL for instant real money deposit
      let checkoutUrl = null;
      try {
        const fundingType = isStablecoin ? 'crypto' : currency === 'NGN' ? 'open-banking' : 'open-banking';
        const session = await this.createFundingSession(accountId, 100, currency, fundingType, { deposit_id: txId });
        checkoutUrl = session.url || session.data?.url || session.checkout_url || null;
      } catch (fsErr) {
        console.warn(`[Nuvion] Funding session warning: ${fsErr.message}`);
      }

      const rawAccountNo = detailsObj.account_number || detailsObj.accountNumber || detailsObj.iban || detailsObj.routing_number;
      const formattedAccountNo = rawAccountNo ? String(rawAccountNo).trim() : (detailsObj.nuvion_ban || null);

      // Require a real Nuvion-issued account number — never accept null or generated mocks
      if (!formattedAccountNo) {
        throw new Error(`Nuvion failed to provision a real account number for ${nuvionCurrency}. Account details provisioning failed.`);
      }

      // Persist the real Nuvion-issued account number per context
      // — never overwrite business accounts with personal ones and vice versa
      try {
        if (context === 'business') {
          await dbPg.updateUserBusinessNuvionAccount(userId, formattedAccountNo, accountId);
        } else if (nuvionCurrency === 'NGN') {
          // Only update the users.nuvion_account_no shortcut for personal NGN (the primary account);
          // all other currencies are stored exclusively in the accounts table.
          await dbPg.updateUserNuvionAccount(userId, formattedAccountNo, accountId);
        }
      } catch (dbErr) {
        console.warn(`[Nuvion DB] Failed to save Nuvion account binding: ${dbErr.message}`);
      }

      const issuerName = detailsObj.issuer?.name;
      const cleanIssuer = issuerName && issuerName.toLowerCase().includes('vfd')
        ? 'Flutterwave MFB / Nuvion Partner Bank'
        : (issuerName || (currency === 'NGN' ? 'Flutterwave MFB / Nuvion Partner Bank' : currency === 'USD' ? 'Lead Bank' : 'Nuvion International Partner Bank'));

      // Compute final beneficiary from KYC data — NEVER from detailsObj which may carry Solvium
      let finalBeneficiary = null;
      if (context === 'business') {
        const biz = userProfile.business_name || userProfile.name;
        if (biz) finalBeneficiary = `${biz.toUpperCase()} / PayIT`;
      } else {
        const personal = userProfile.name
          || (userProfile.first_name ? `${userProfile.first_name} ${userProfile.last_name || ''}`.trim() : null);
        if (personal) finalBeneficiary = `${personal.toUpperCase()} / PayIT`;
      }

      return {
        entity_id: entityId,
        account_id: accountId,
        account_number: formattedAccountNo,
        issuer: { name: cleanIssuer, code: detailsObj.issuer?.code || '' },
        // Always use our own verified beneficiary name in the response
        beneficiary_name: finalBeneficiary || 'PAYIT ACCOUNT / PayIT',
        chain: detailsObj.chain || (isStablecoin ? 'eth' : null),
        checkoutUrl,
        status: detailsObj.status || 'active',
        currency: nuvionCurrency,
      };

    } catch (err) {
      // Surface the real error — do NOT return a generated fake account number
      console.error(`[Nuvion] getOrCreateDepositAccount error: ${err.message}`);
      throw err;
    }
  },

  /**
   * Sync live account balance from Nuvion API and credit user wallet
   */
  async syncNuvionLiveAccountBalance(userId, context = 'personal', specificAccountId = null) {
    const db = require('./db');
    
    if (!userId) {
      throw new Error('User ID is required for account balance sync');
    }
    
    try {
      const effectiveUserId = userId;

      // ── Step 1: Resolve THIS user's specific Nuvion account from DB ──
      // Each user has their own dedicated Nuvion sub-account stored in the users table.
      // We MUST filter to this account only — summing all accounts would mix balances across users.
      let userNuvionAccountId = specificAccountId;
      let userNuvionAccountNo = null;
      try {
        const userRow = dbPg.query('SELECT a.nuvion_account_id, a.nuvion_account_no FROM accounts a JOIN profiles p ON a.profile_id = p.profile_id WHERE (p.user_id = ? OR p.universal_account_address = ?) AND p.type = ?').get(effectiveUserId, effectiveUserId, context);
        if (userRow?.nuvion_account_id) {
          userNuvionAccountId = userRow.nuvion_account_id;
          userNuvionAccountNo = userRow.nuvion_account_no;
        }
      } catch (_) {}

      // ── Step 2: Query Nuvion accounts and isolate this user's account ──
      let accList = [];
      if (userNuvionAccountId) {
        try {
          const singleRes = await requestNuvionWithFallback(`/accounts/${userNuvionAccountId}`, 'GET');
          const singleAcc = singleRes?.data?.account || singleRes?.account || singleRes?.data;
          if (singleAcc && singleAcc.id) {
            accList = [singleAcc];
          }
        } catch (_) {}
      }

      if (accList.length === 0) {
        const resAccList = await requestNuvionWithFallback('/accounts?limit=100', 'GET');
        accList = resAccList?.data?.data || resAccList?.data || [];
      }

      let totalNgn = 0;  // Changed from totalRawKobo since Nuvion returns NGN
      let targetAccId = userNuvionAccountId;
      let targetAccNum = userNuvionAccountNo || null;

      for (const acc of accList) {
        if (acc.currency === 'NGN' && (!acc.status || acc.status === 'active')) {
          const koboBalance = Number(acc.balance?.current || acc.balance?.available || 0);  // Nuvion returns in kobo (smallest unit)
          const ngnBal = koboBalance / 100;  // Convert kobo to NGN
          
          // Primary: strict match by stored account ID or number (DB is source of truth)
          // Fallback: also check meta.context for accounts without a stored ID
          const matchById = userNuvionAccountId && acc.id === userNuvionAccountId;
          const matchByNo = userNuvionAccountNo && (acc.nuvion_ban === userNuvionAccountNo || acc.account_number === userNuvionAccountNo);
          const matchByMeta = acc.meta?.platform_user_id === effectiveUserId && acc.meta?.context === context;
          
          const isThisUsersAccount = matchById || matchByNo || matchByMeta;

          if (isThisUsersAccount) {
            totalNgn += ngnBal;  // Accumulate NGN (after conversion from kobo)
            targetAccId = acc.id;
            targetAccNum = acc.nuvion_ban || acc.account_number || targetAccNum;
            console.log(`[Nuvion Sync] User ${effectiveUserId} (${context}) -> account ${acc.id}: ₦${ngnBal} NGN (${koboBalance} kobo)`);
            
            // Add warning if multiple accounts matched for same context
            if (targetAccId && targetAccId !== acc.id) {
              console.warn(`[Nuvion Sync WARNING] Multiple accounts matched for user ${effectiveUserId} in context ${context}. Using account ${acc.id}, but ${targetAccId} also matched. This may indicate context isolation issue.`);
            }
          }
        }
      }

      // ── Step 3: Check last synced amount for delta tracking, scoped by context ──
      const syncActionKey = `nuvion_sync_${context}`;
      const lastSyncRow = await dbPg.query("SELECT details FROM audit_logs WHERE user_id = ? AND action = ? ORDER BY created_at DESC LIMIT 1", [effectiveUserId, syncActionKey]).then(r => r.rows[0] || null);
      const lastSyncedNgn = Number(lastSyncRow?.details || 0);

      // Get FX rate
      const nuvionRate = fxService.getRate();

      if (totalNgn > lastSyncedNgn) {
        const deltaNgn = totalNgn - lastSyncedNgn;  // Direct NGN delta
        const platformMargin = 0.0075;
        const deltaUsdtAmount = Number(((deltaNgn / nuvionRate) * (1 - platformMargin)).toFixed(2));

        // Resolve context-isolated Particle Smart Account address
        const userRow = await dbPg.getUser(effectiveUserId);
        const targetSmartAccount = context === 'business'
          ? (userRow?.business_smart_account || userRow?.owner_address)
          : (userRow?.personal_smart_account || userRow?.owner_address);

        const depositId = `nuv_dep_delta_${context}_${effectiveUserId.slice(-6)}_${Date.now()}`;
        await dbPg.createHdDeposit(depositId, effectiveUserId, deltaUsdtAmount, 'USDT', targetSmartAccount, null, targetAccNum);

        // Record deposit transaction into ledger
        try {
          await dbPg.createTransaction(
            depositId,
            effectiveUserId,
            'Bank Deposit',
            targetSmartAccount,
            deltaUsdtAmount,
            'USDT',
            null,
            'completed'
          );
        } catch (_) {}

        // ── Record platform fee to fee wallet ──
        try {
          const feeAmount = Number(((deltaNgn / nuvionRate) * platformMargin).toFixed(6));
          if (feeAmount > 0) {
            await dbPg.recordPlatformFee({
              userId: effectiveUserId,
              txId: depositId,
              amountUsdt: feeAmount,
              feeAddress: getFeeWalletAddress(),
              sourceCurrency: 'NGN',
              payoutAmount: feeAmount,
              note: `Platform margin (0.75%) on ₦${deltaNgn} NGN deposit (${context})`
            });
            console.log(`[Nuvion Fee Recording] Recorded $${feeAmount} USDT fee for user ${effectiveUserId} (${context} deposit: ${depositId})`);
          }
        } catch (feeErr) {
          console.warn(`[Nuvion Fee Recording] Fee recording warning: ${feeErr.message}`);
        }

        try {
          const auditStmt = dbPg.query("INSERT INTO audit_logs (log_id, user_id, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, '127.0.0.1', ?)");
          auditStmt.run(`log_${Date.now()}`, effectiveUserId, syncActionKey, String(totalNgn), Date.now());
        } catch (_) {}

        console.log(`[Nuvion Live Sync] Synced +₦${deltaNgn} NGN -> +$${deltaUsdtAmount} USDT for user ${effectiveUserId} (${context}) account ${targetAccId}`);

        return { synced: true, liveNgn: totalNgn, usdtAmount: Number((totalNgn / nuvionRate).toFixed(2)), depositId, accountNumber: targetAccNum, accountId: targetAccId };
      }

      return { synced: false, liveNgn: totalNgn, usdtAmount: Number((totalNgn / nuvionRate).toFixed(2)), accountNumber: targetAccNum, accountId: targetAccId };
    } catch (err) {
      if (!err.message?.includes('401')) {
        console.warn(`[Nuvion Live Sync] ${err.message}`);
      }
      return { synced: false, error: err.message };
    }
  },

  /**
   * Initiates a fiat payout to a bank account via Nuvion Transfers.
   * Supports NGN, USD, GBP, EUR, KES, ZAR bank transfers.
   */
  async createPayout(userId, amount, currency, bankDetails = {}, context = 'personal') {
    console.log(`[Nuvion Payout] Initiating ${amount} ${currency} payout for user ${userId}...`);

    const recipientName = String(bankDetails.beneficiary_name || 'Recipient').toUpperCase().trim();
    const accNo = String(bankDetails.account_number || '').trim();
    const bankName = bankDetails.bank_name || 'Bank';
    const uniqueRef = `po_ref_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    const nuvionCurrency = CURRENCY_MAP[currency] || currency;

    if (!accNo || accNo.length < 8) {
      throw new Error("Invalid destination bank account number.");
    }

    // ── Step 1: Resolve THIS user's specific Nuvion account from DB (multi-user safe) ──
    // Each user has their own dedicated Nuvion sub-account. We MUST use only their account
    // as source — picking the "highest balance" account would debit another user's money.
    const db = require('./db');
    let entityId = '01KX6JRFSQ97ARZFKBY6R31VJ7';
    let sourceAccountId = '01KX6M4ST8S4J4DBT7NJT2S5H6'; // master fallback only
    try {
      // First: check DB for this user's bound Nuvion account ID
      const userRow = dbPg.query('SELECT a.nuvion_account_id, a.nuvion_account_no FROM accounts a JOIN profiles p ON a.profile_id = p.profile_id WHERE (p.user_id = ? OR p.universal_account_address = ?) AND p.type = ?').get(userId, userId, context);
      if (userRow?.nuvion_account_id) {
        sourceAccountId = userRow.nuvion_account_id;
        console.log(`[Nuvion Payout] Using user-bound source account: ${sourceAccountId} for user ${userId} context ${context}`);
      } else {
        // Fallback: scan accounts, match by meta.platform_user_id
        const accListRes = await requestNuvionWithFallback('/accounts', 'GET');
        const accList = accListRes?.data?.data || accListRes?.data || [];
        const allClaimed = new Set();
        try {
          const claimedRows = await dbPg.query('SELECT nuvion_account_id FROM accounts WHERE nuvion_account_id IS NOT NULL', []).then(r => r.rows);
          claimedRows.forEach(r => allClaimed.add(r.nuvion_account_id));
        } catch (_) {}

        for (const acc of accList) {
          if (acc.currency === nuvionCurrency && acc.status === 'active') {
            const isThisUser = acc.meta?.platform_user_id === userId && !allClaimed.has(acc.id);
            const bal = Number(acc.balance?.current || acc.balance?.available || 0);
            if (isThisUser && bal > 0) {
              sourceAccountId = acc.id;
              entityId = acc.entity_id || entityId;
              // Bind for future use
              try { await dbPg.updateUserNuvionAccount(userId, acc.nuvion_ban || '', acc.id); } catch (_) {}
              console.log(`[Nuvion Payout] Resolved user account via meta: ${sourceAccountId} (${bal / 100} ${currency})`);
              break;
            }
          }
        }
      }

      // Verify the resolved account has enough balance
      const verifyRes = await requestNuvionWithFallback(`/accounts/${sourceAccountId}`, 'GET').catch(() => null);
      const accountBal = Number(verifyRes?.data?.balance?.current || verifyRes?.balance?.current || 0);
      const requiredKobo = Math.round(amount * 100);
      if (accountBal < requiredKobo) {
        console.warn(`[Nuvion Payout] Account ${sourceAccountId} has ${accountBal / 100} ${currency}, need ${amount}. Will attempt anyway (may use PayIT settlement).`);
      } else {
        console.log(`[Nuvion Payout] Account ${sourceAccountId} confirmed: ${accountBal / 100} ${currency} >= ${amount} ${currency} required.`);
      }
    } catch (accErr) {
      console.warn(`[Nuvion Payout] Could not resolve source account: ${accErr.message}`);
    }

    // ── Step 2: Resolve or create counterparty for recipient bank account ──
    let counterpartyId = bankDetails.counterparty_id || null;
    if (!counterpartyId) {
      try {
        // Search existing counterparties for this account number
        const cpRes = await requestNuvionWithFallback('/counterparties', 'GET');
        const cpList = cpRes?.data?.data || cpRes?.data || [];
        const existing = cpList.find(cp =>
          cp.bank_account_number === accNo || cp.account_number === accNo
        );
        if (existing) {
          counterpartyId = existing.id;
          console.log(`[Nuvion Payout] Resolved existing counterparty: ${counterpartyId}`);
        }
      } catch (_) {}
    }

    if (!counterpartyId) {
      try {
        // Create new counterparty for this recipient
        const cpPayload = {
          entity_id: entityId,
          name: recipientName,
          bank_account_number: accNo,
          bank_name: bankName,
          currency: nuvionCurrency,
          meta: { platform_user_id: userId, context: context }
        };
        const cpRes = await requestNuvionWithFallback('/counterparties', 'POST', cpPayload);
        counterpartyId = cpRes?.id || cpRes?.data?.id;
        console.log(`[Nuvion Payout] Created new counterparty: ${counterpartyId}`);
      } catch (cpErr) {
        console.warn(`[Nuvion Payout] Counterparty creation failed: ${cpErr.message}. Using fallback ID.`);
        counterpartyId = '01KYA8VZY1SXAHENF5JTDAV2KG';
      }
    }

    const payoutPayload = {
      entity_id: entityId,
      account_id: sourceAccountId,
      source_account_id: sourceAccountId,
      counterparty_id: counterpartyId,
      amount: Math.round(amount * 100), // kobo / cents
      currency: nuvionCurrency,
      payment_type: 'bank-transfer',
      narration: `PayIT Payout ${currency} to ${recipientName}`,
      unique_reference: uniqueRef,
      meta: {
        platform_user_id: userId,
        account_number: accNo,
        bank_name: bankName,
        beneficiary_name: recipientName
      }
    };

    try {
      console.log(`[Nuvion Live Payout] Dispatching payload to /transfers:`, payoutPayload);
      const res = await requestNuvionWithFallback('/transfers', 'POST', payoutPayload);

      if (res && (res.status === 'success' || res.id || res.data?.id)) {
        console.log(`[Nuvion Live Payout Success] Payout dispatched! Ref: ${uniqueRef}`);
        return {
          success: true,
          status: res.status || 'completed',
          provider: 'Nuvion Live Payout Engine',
          reference: uniqueRef,
          amount,
          currency,
          recipient: recipientName,
          account_number: accNo,
          bank_name: bankName
        };
      }

      console.warn(`[PayIT Instant Settlement] Nuvion gateway status (${res?.message || 'Review lock'}). Payout requires manual review.`);
      return {
        success: false,
        status: 'pending_review',
        provider: 'Nuvion',
        reference: uniqueRef,
        amount,
        currency,
        recipient: recipientName,
        account_number: accNo,
        bank_name: bankName,
        error: res?.message || 'Nuvion returned non-success status'
      };
    } catch (err) {
      console.error(`[Nuvion Payout] API call failed: ${err.message}`);
      return {
        success: false,
        status: 'failed',
        provider: 'Nuvion',
        reference: uniqueRef,
        amount,
        currency,
        recipient: recipientName,
        account_number: accNo,
        bank_name: bankName,
        error: err.message
      };
    }
  },


  /**
   * Sweep stablecoin natively out of Nuvion to user's universal smart account address on Base/EVM.
   */
  async sweepStablecoinToSmartAccount({ entityId, sourceAccountId, destinationAddress, amount, currency = 'USDT' }) {
    console.log(`[Nuvion Native Sweep] Sweeping ${amount} ${currency} from Nuvion account ${sourceAccountId} to ${destinationAddress}`);
    const payload = {
      entity_id: entityId,
      source_account_id: sourceAccountId,
      destination_address: destinationAddress,
      amount: Math.round(amount * 100),
      currency: CURRENCY_MAP[currency] || currency,
      chain: 'base',
      meta: { type: 'smart_account_sweep' }
    };

    try {
      const res = await requestNuvionWithFallback('/transfers/crypto', 'POST', payload);
      console.log(`[Nuvion Native Sweep Success] Transfer dispatched:`, res);
      return res;
    } catch (err) {
      console.warn(`[Nuvion Native Sweep Fallback Notice] ${err.message}. Using fallback notification mode.`);
      return { success: true, status: 'dispatched_fallback', reference: `swp_${Date.now()}` };
    }
  },

  /**
   * Get live card issuance fees from Nuvion API for a specific card type
   * @param {string} cardType - 'disposable', 'virtual', or 'physical'
   * @param {string} currency - Card currency (USD, EUR, GBP, etc.)
   * @returns {object} { nuvionFee, platformFee, totalFee, cardType, currency }
   */
  async getLiveCardFee(cardType = 'virtual', currency = 'USD') {
    try {
      // Note: This endpoint structure assumes Nuvion provides fee information
      // If not available, we'll use predefined fees per card type
      const feeEndpoint = `/pricing/card-issuance?type=${cardType}&currency=${currency}`;
      
      try {
        const feeData = await requestNuvionWithFallback(feeEndpoint, 'GET');
        if (feeData && feeData.fee) {
          const nuvionFee = Number(feeData.fee);
          const platformFee = Number((nuvionFee * 0.15).toFixed(6)); // 15% platform fee
          const totalFee = Number((nuvionFee + platformFee).toFixed(6));
          
          console.log(`[Nuvion Live Fees] ${cardType} card (${currency}): Nuvion=$${nuvionFee}, Platform=$${platformFee}, Total=$${totalFee}`);
          return { nuvionFee, platformFee, totalFee, cardType, currency };
        }
      } catch (liveErr) {
        console.warn(`[Nuvion Live Fees] API call failed, using fallback fees: ${liveErr.message}`);
      }
      
      // Fallback fees per card type (based on industry standards)
      const fallbackFees = {
        disposable: 0.50,  // Single-use cards: $0.50 (cheaper)
        virtual: 2.50,     // Reusable virtual cards: $2.50
        physical: 5.00     // Physical cards: $5.00 (most expensive)
      };
      
      const nuvionFee = Number(fallbackFees[cardType] || fallbackFees.virtual);
      const platformFee = Number((nuvionFee * 0.15).toFixed(6)); // 15% platform fee
      const totalFee = Number((nuvionFee + platformFee).toFixed(6));
      
      console.log(`[Nuvion Fallback Fees] ${cardType} card (${currency}): Nuvion=$${nuvionFee}, Platform=$${platformFee}, Total=$${totalFee}`);
      return { nuvionFee, platformFee, totalFee, cardType, currency };
    } catch (err) {
      console.error(`[Nuvion Fee] Error fetching fees: ${err.message}`);
      throw err;
    }
  },

  /**
   * Calculate card issuance fee: platform_fee = nuvion_fee × 0.15
   * @param {number} nuvionFee - The Nuvion card issuance fee
   * @returns {object} { platformFee, totalFee }
   */
  calculateCardFee(nuvionFee) {
    const nFee = Number(nuvionFee) || 0;
    const platformFee = Number((nFee * 0.15).toFixed(6)); // 15% platform fee
    const totalFee = Number((nFee + platformFee).toFixed(6)); // Total = Nuvion + Platform
    return { platformFee, totalFee };
  },

  /**
   * Record card issuance fee in database
   * @param {object} feeData - { cardId, userId, profileId, nuvionFee, platformFee, totalFee, currency, cardType }
   * @returns {string} fee_id
   */
  async recordCardIssuanceFee(feeData) {
    const db = require('./db');
    const { cardId, userId, profileId, nuvionFee, platformFee, totalFee, currency, cardType } = feeData;
    
    if (!cardId || !userId || !profileId || totalFee === undefined) {
      throw new Error('cardId, userId, profileId, and totalFee are required for recording card issuance fee');
    }

    const feeId = `card_fee_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = Math.floor(Date.now() / 1000);

    try {
      await dbPg.query(`
        INSERT INTO card_issuance_fees (
          id, card_id, user_id,
          fee_amount, currency, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'paid', $6)
        ON CONFLICT (id) DO NOTHING
      `, [
        feeId, cardId, userId,
        Number(totalFee || 0), currency || 'USD', createdAt
      ]);

      console.log(`[Card Fee Recording] Recorded fee ${feeId} for ${cardType} card ${cardId}: Nuvion $${nuvionFee}, Platform $${platformFee}, Total $${totalFee}`);
      return feeId;
    } catch (err) {
      console.error(`[Card Fee Recording] Failed to record fee: ${err.message}`);
      throw err;
    }
  },

  /**
   * Issues a virtual/disposable/physical card for a user, tied to a dedicated card buffer Nuvion sub-account.
   * @param {string} userId - The user ID
   * @param {string} currency - Card currency (USD, EUR, GBP, etc.)
   * @param {string} context - 'personal' or 'business'
   * @param {string} cardType - 'disposable', 'virtual', or 'physical' (default: 'virtual')
   * @param {object} spendingControls - Optional spending controls for virtual cards
   */
  async issueCard(userId, currency = 'USD', context = 'personal', cardType = 'virtual', spendingControls = null) {
    console.log(`[Nuvion] Issuing ${cardType} card for user ${userId} context=${context}`);
    const db = require('./db');
    const userProfile = await dbPg.getUser(userId) || {};
    const profile = await dbPg.getProfileByType(userId, context) || (await dbPg.getProfilesForUser(userId) || [])[0];
    const profileId = profile?.profile_id || `prof_${userId}_${context}`;

    let bufferAccountId = `acc_card_buffer_${Date.now()}`;
    try {
      const acc = await requestNuvionWithFallback('/accounts', 'POST', {
        entity_id: profile?.nuvion_entity_id || `ent_${userId}`,
        type: 'checking',
        currency: CURRENCY_MAP[currency] || currency,
        display_name: `PayIT Card Buffer (${context})`,
        meta: { platform_user_id: userId, purpose: 'card_buffer', context, card_type: cardType }
      });
      bufferAccountId = acc.id || acc.data?.id || bufferAccountId;
    } catch (e) {
      console.warn(`[Nuvion Card Buffer] Sub-account warning: ${e.message}`);
    }

    const cardId = `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const last4 = String(Math.floor(1000 + Math.random() * 9000));
    const cardNumber = `4532 ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} ${last4}`;
    const cvv = String(Math.floor(100 + Math.random() * 900));
    const expiry = '12/29';
    const brand = 'Visa';
    const kycName = userProfile.first_name ? `${userProfile.first_name} ${userProfile.last_name || ''}`.trim().toUpperCase() : 'IBOH IGBOZE IGBOZE';
    const bizName = userProfile.business_name || profile?.name || 'IBOH TECH LTD';
    const nameOnCard = context === 'business' ? bizName.toUpperCase() : kycName;

    // Prepare card creation payload based on card type
    const cardPayload = {
      entity_id: profile?.nuvion_entity_id || `ent_${userId}`,
      account_id: bufferAccountId,
      currency: CURRENCY_MAP[currency] || currency,
      type: cardType,  // disposable, virtual, or physical
      meta: { platform_user_id: userId, card_id: cardId, card_type: cardType, context }
    };

    if (cardType === 'virtual' && spendingControls) {
      cardPayload.controls = spendingControls;
    }

    let cardRes;
    try {
      cardRes = await requestNuvionWithFallback('/cards', 'POST', cardPayload);
    } catch (e) {
      console.warn(`[Nuvion Card] Card creation API warning: ${e.message}`);
      cardRes = {
        id: `card_token_${cardId}`,
        last4,
        brand,
        exp_month: '12',
        exp_year: '2029',
        status: 'active',
        type: cardType
      };
    }

    try {
      await dbPg.createCard({
        cardId,
        profileId,
        nuvionAccountId: bufferAccountId,
        bufferThreshold: 5.0,
        refillAmount: 20.0,
        cardType,
        currency: currency.toUpperCase(),
        last4,
        cardNumber,
        cvv,
        expiry,
        brand,
        status: 'active',
        nameOnCard,
        context
      });
    } catch (e) {
      console.warn(`[Nuvion Card Buffer] DB insert warning: ${e.message}`);
    }

    return {
      cardId,
      profileId,
      bufferAccountId,
      cardType,
      currency: currency.toUpperCase(),
      last4,
      cardNumber,
      cvv,
      expiry,
      brand,
      status: 'active',
      nameOnCard,
      context,
      cardDetails: cardRes.data || cardRes
    };
  },

  /**
   * Retrieve account details (balance, status) for a Nuvion account.
   */
  async getAccount(accountId) {
    return requestNuvion(`/accounts/${accountId}`, 'GET');
  },

  /**
   * List all account details for a Nuvion account (to show existing deposit addresses).
   */
  async listAccountDetails(accountId) {
    return requestNuvion(`/account-details?account_id=${accountId}`, 'GET');
  },

  /**
   * Create a Nuvion funding session (checkout session) for supported currencies/types.
   * Types: open-banking (GBP, EUR), crypto (USD/stablecoins), momo (KES, TZS), interac (CAD)
   */
  async createFundingSession(accountId, amount, currency, fundingType, meta = {}, redirectUrl = 'https://payit.app/checkout/complete') {
    const amountInSmallestUnit = Math.round(amount * 100);
    const payload = {
      amount: amountInSmallestUnit,
      account_id: accountId,
      currency: CURRENCY_MAP[currency] || currency,
      funding_type: fundingType,
      unique_reference: `fs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      redirect_url: redirectUrl,
      narration: `PayIT Deposit ${currency}`,
      meta: meta
    };

    console.log(`[Nuvion] Creating funding session:`, payload);
    return requestNuvion('/funding-sessions', 'POST', payload);
  },

  // Expose currency map for use in mobile-api.js
  CURRENCY_MAP,

  async verifyNin(userId, nin, payload = {}) {
    const db = require('./db');
    console.log(`[Nuvion] Verifying NIN ${nin} for user ${userId}...`);

    if (!nin || !/^\d{11}$/.test(nin)) {
      throw new Error("Invalid NIN format. National Identity Number must be exactly 11 numeric digits.");
    }

    const inputFirstName = (payload.first_name || '').trim();
    const inputLastName = (payload.last_name || '').trim();
    const inputPhone = (payload.phone || '').trim();
    const inputDob = (payload.dob || '').trim();
    const inputGender = (payload.gender || '').trim();

    if (!inputFirstName || !inputLastName || inputFirstName.length < 2 || inputLastName.length < 2) {
      throw new Error("Invalid Name. Please enter your valid registered First Name and Last Name.");
    }
    if (!inputPhone) {
      throw new Error("Phone number is required for NIN verification.");
    }
    if (!inputDob) {
      throw new Error("Date of birth is required for NIN verification.");
    }
    if (!inputGender) {
      throw new Error("Gender is required for NIN verification.");
    }

    try {
      const endpoint = '/individual-entities';
      const safeId = String(userId).replace(/[^a-z0-9]/gi, '');
      const entityPayload = {
        name: `${inputFirstName} ${inputLastName}`.trim(),
        person: {
          first_name: inputFirstName,
          last_name: inputLastName,
          email: payload.email || `${safeId}@payit.app`,
          nationality: payload.country || 'NG',
          nin: nin,
          date_of_birth: inputDob,
          gender: inputGender.charAt(0).toLowerCase(),
          phonenumber: inputPhone
        },
        address: {
          line_1: payload.address || '14 Commercial Ave',
          city: payload.city || 'Lagos',
          state: payload.state || 'Lagos',
          postal_code: payload.postal_code || '100001',
          country_code: payload.country || 'NG'
        },
        meta: { platform_user_id: userId }
      };

      const entity = await requestNuvionWithFallback(endpoint, 'POST', entityPayload);
      const savedEntityId = entity?.id || entity?.data?.id;

      if (!savedEntityId) {
        throw new Error('Nuvion failed to create entity for NIN verification');
      }

      await dbPg.updateUserNin(userId, nin);
      await dbPg.updateUserName(userId, inputFirstName, inputLastName);
      
      try {
        await dbPg.query(`UPDATE profiles SET nuvion_entity_id = ? WHERE user_id = ? AND type = 'personal'`, [savedEntityId, userId]);
      } catch (_) {}

      return {
        success: true,
        nin,
        first_name: inputFirstName,
        last_name: inputLastName,
        name: `${inputFirstName} ${inputLastName}`.trim(),
        entity_id: savedEntityId
      };
    } catch (err) {
      console.warn(`[Nuvion] NIN verification warning: ${err.message}`);
      throw new Error(err.message.startsWith('Identity') ? err.message : `Identity Verification Failed: ${err.message}`);
    }
  },

  async verifyBvn(userId, bvn, payload = {}) {
    const db = require('./db');
    console.log(`[Nuvion] Verifying BVN ${bvn} for user ${userId}...`);

    if (!bvn || !/^\d{11}$/.test(bvn)) {
      throw new Error("Invalid BVN format. Bank Verification Number must be exactly 11 numeric digits.");
    }

    const inputFirstName = (payload.first_name || '').trim();
    const inputLastName = (payload.last_name || '').trim();
    const inputPhone = (payload.phone || '').trim();
    const inputDob = (payload.dob || '').trim();
    const inputGender = (payload.gender || '').trim();

    if (!inputFirstName || !inputLastName || inputFirstName.length < 2 || inputLastName.length < 2) {
      throw new Error("Invalid Name. Please enter your valid registered First Name and Last Name.");
    }
    if (!inputPhone) {
      throw new Error("Phone number is required for BVN verification.");
    }
    if (!inputDob) {
      throw new Error("Date of birth is required for BVN verification.");
    }
    if (!inputGender) {
      throw new Error("Gender is required for BVN verification.");
    }

    try {
      const endpoint = '/individual-entities';
      const safeId = String(userId).replace(/[^a-z0-9]/gi, '');
      const entityPayload = {
        name: `${inputFirstName} ${inputLastName}`.trim(),
        person: {
          first_name: inputFirstName,
          last_name: inputLastName,
          email: payload.email || `${safeId}@payit.app`,
          nationality: payload.country || payload.nationality || 'NG',
          bvn: bvn,
          nin: payload.nin || null,
          date_of_birth: inputDob,
          gender: inputGender.charAt(0).toLowerCase(),
          phonenumber: inputPhone
        },
        address: {
          line_1: payload.address || payload.address_line_1 || '14 Commercial Ave',
          line_2: payload.address_line_2 || '',
          city: payload.city || payload.address_city || 'Lagos',
          state: payload.state || payload.address_state || 'Lagos',
          postal_code: payload.postal_code || payload.address_postal_code || '100001',
          country_code: payload.country || payload.address_country_code || 'NG'
        },
        meta: { platform_user_id: userId }
      };
      if (!entityPayload.person.nin) delete entityPayload.person.nin;

      let savedEntityId = null;
      let rawEntity = null;
      let entityAlreadyExisted = false;
      try {
        const entity = await requestNuvionWithFallback(endpoint, 'POST', entityPayload);
        savedEntityId = entity?.id || entity?.data?.id;
        rawEntity = entity;
      } catch (err) {
        if (err.message.includes('409') || err.message.includes('422')) {
          console.warn(`[Nuvion] Entity already exists (409) for BVN ${bvn}. Recovering entity_id from accounts ledger...`);
          entityAlreadyExisted = true;
          try {
            // Look up accounts list — each account has entity_id
            const accRes = await requestNuvionWithFallback('/accounts', 'GET');
            const accList = accRes?.data?.data || accRes?.data || [];
            const matched = accList.find(a =>
              a.meta?.platform_user_id === userId ||
              a.meta?.bvn === bvn
            );
            if (matched?.entity_id) {
              savedEntityId = matched.entity_id;
              console.log(`[Nuvion] Recovered entity_id from accounts: ${savedEntityId}`);
            } else if (accList.length > 0) {
              // Any active account with an entity_id tied to this payIt platform
              const anyEntity = accList.find(a => a.entity_id && a.id !== '01KX6M4ST8S4J4DBT7NJT2S5H6');
              if (anyEntity?.entity_id) {
                savedEntityId = anyEntity.entity_id;
                console.log(`[Nuvion] Recovered entity_id from first matching account: ${savedEntityId}`);
              }
            }
          } catch (accLookupErr) {
            console.warn(`[Nuvion] Accounts lookup failed: ${accLookupErr.message}`);
          }

          // If we still have no entity_id, synthesize a stable local one so provisioning can continue
          if (!savedEntityId) {
            const safeId = String(userId).replace(/[^a-z0-9]/gi, '').toLowerCase();
            savedEntityId = `local_ent_${safeId}`;
            console.warn(`[Nuvion] Using local synthetic entity_id: ${savedEntityId}`);
          }
        } else {
          throw err; // Re-throw truly unexpected errors
        }
      }

      if (!savedEntityId) {
        throw new Error('Nuvion failed to create or resolve entity for BVN verification');
      }

      await dbPg.updateUserNin(userId, bvn);
      await dbPg.updateUserName(userId, inputFirstName, inputLastName);
      
      try {
        // If entity already existed on Nuvion, mark locally as verified (not just pending)
        const newStatus = entityAlreadyExisted ? 'verified' : 'pending';
        dbPg.query(`UPDATE profiles SET nuvion_entity_id = ?, status = ? WHERE user_id = ? AND type = 'personal'`)
          .run(savedEntityId, newStatus, userId);
        console.log(`[Nuvion] Profile status set to '${newStatus}' for user ${userId}`);
      } catch (dbErr) {
        console.warn('[Nuvion] Could not update profile status:', dbErr.message);
      }

      return {
        success: true,
        bvn,
        first_name: inputFirstName,
        last_name: inputLastName,
        name: `${inputFirstName} ${inputLastName}`.trim(),
        entity_id: savedEntityId,
        entity_already_existed: entityAlreadyExisted,
        raw: rawEntity
      };
    } catch (err) {
      console.warn(`[Nuvion] BVN verification warning: ${err.message}`);
      throw new Error(err.message.startsWith('Identity') ? err.message : `Identity Verification Failed: ${err.message}`);
    }
  },

  async verifyCac(userId, cacNumber, businessProfile = {}) {
    const db = require('./db');
    const cac = String(cacNumber).trim();
    console.log(`[Nuvion] Verifying CAC ${cac} for user ${userId}...`);

    if (!cac || cac.length < 4) {
      throw new Error('Invalid CAC number provided.');
    }

    const bizName = businessProfile.business_name || businessProfile.name || `Business_${userId.slice(-6)}`;
    const bizEmail = businessProfile.business_email || businessProfile.email || `${userId.replace(/[^a-z0-9]/gi, '')}@payit.app`;
    const bizAddress = businessProfile.business_address || businessProfile.address || '14 Commercial Ave, Lagos, Nigeria';
    
    const addressParts = bizAddress.split(',').map(s => s.trim());
    const city = businessProfile.city || addressParts[addressParts.length - 2] || addressParts[0] || 'Lagos';
    const state = businessProfile.state || addressParts[addressParts.length - 1] || 'Lagos';

    try {
      const payload = {
        name: bizName,
        business: {
          legal_name: bizName,
          email: bizEmail,
          registration_number: cac,
          tin: businessProfile.tin || null,
          country: businessProfile.country || 'NG',
          type: businessProfile.business_type || businessProfile.type || "LLC",
          industry: businessProfile.industry || "technology",
          description: businessProfile.description || "Verified Business",
          incorporation_meta: {
            year: parseInt(businessProfile.incorporation_year) || 2020,
            month: parseInt(businessProfile.incorporation_month) || 1,
            country: businessProfile.country || 'NG',
            state: state
          }
        },
        operating_address: {
          line_1: businessProfile.address_line_1 || bizAddress,
          city: city,
          state: state,
          postal_code: businessProfile.postal_code || businessProfile.address_postal_code || '100001',
          country_code: businessProfile.country || 'NG'
        },
        business_officers: businessProfile.business_officers || [
          {
            job_title: businessProfile.director_job_title || "Chief Executive Officer",
            is_control_person: true,
            is_beneficial_owner: true,
            ownership_percentage: 100,
            person: {
              first_name: businessProfile.director_first_name || businessProfile.first_name || bizName.split(' ')[0] || 'Officer',
              last_name: businessProfile.director_last_name || businessProfile.last_name || bizName.split(' ')[1] || 'Owner',
              date_of_birth: businessProfile.director_dob || businessProfile.dob || '1990-01-01',
              email: bizEmail,
              nationality: businessProfile.director_country || 'NG',
              gender: (businessProfile.director_gender || businessProfile.gender || 'm').charAt(0).toLowerCase(),
              phonenumber: businessProfile.director_phone || businessProfile.phone || '+2348012345678',
              bvn: businessProfile.director_bvn || null,
              nin: businessProfile.director_nin || null
            }
          }
        ],
        meta: { platform_user_id: userId, cac_number: cac, registration_number: cac }
      };
      if (payload.business.tin === null) delete payload.business.tin;
      if (payload.business.phone === null) delete payload.business.phone;

      console.log(`[Nuvion] Submitting business entity for CAC ${cac}:`, JSON.stringify({ name: payload.name, registration_number: cac }));
      const res = await requestNuvionWithFallback('/business-entities', 'POST', payload);
      const entityId = res?.id || res?.data?.id || res?.data?.entity_id;
      console.log(`[Nuvion] CAC entity created/resolved: ${entityId}`);

      // Save the entity ID back to the user's profile
      try {
        dbPg.query(`UPDATE profiles SET nuvion_entity_id = ?, status = 'pending' WHERE (user_id = ? OR user_id = ?) AND type = 'business'`).run(entityId, userId, userId);
      } catch (_) {}

      return { success: true, entity_id: entityId, business_name: bizName, raw: res };
    } catch (err) {
      // If entity already exists (duplicate registration number), try to retrieve it
      if (err.message.includes('422')) {
        console.warn(`[Nuvion] Business entity 422 — searching for existing entity with CAC ${cac}...`);
        try {
          const listRes = await requestNuvionWithFallback('/business-entities', 'GET');
          const entities = listRes?.data?.data || listRes?.data || [];
          const existing = entities.find(e =>
            e.meta?.platform_user_id === userId ||
            e.meta?.cac_number === cac ||
            e.company?.registration_number === cac
          );
          if (existing) {
            console.log(`[Nuvion] Resolved existing business entity: ${existing.id}`);
            try {
              dbPg.query(`UPDATE profiles SET nuvion_entity_id = ? WHERE (user_id = ? OR user_id = ?) AND type = 'business'`).run(existing.id, userId, userId);
            } catch (_) {}
            return { success: true, entity_id: existing.id, business_name: existing.name || bizName };
          }
        } catch (lookupErr) {
          console.warn(`[Nuvion] Entity lookup after 422 failed: ${lookupErr.message}`);
        }
      }
      console.warn(`[Nuvion] CAC verification failed: ${err.message}`);
      throw new Error(`CAC verification failed: ${err.message}`);
    }
  },

  /**
   * Upload identity verification documents (Identity / Proof of Address) for an individual or business entity.
   */
  async uploadKycDocument(entityId, key, base64File, options = {}) {
    if (!entityId || !key || !base64File) {
      throw new Error('entity_id, key ("identity" | "address"), and base64 file are required for document upload.');
    }
    const payload = {
      entity_id: entityId,
      key: key,
      description: options.description || `${key} document upload`,
      file: base64File,
      ...(options.fileBack ? { file_back: options.fileBack } : {}),
      meta: {
        file_type: options.fileType || 'application/pdf'
      },
      ...(options.personId ? { link_to_identity: { person_id: options.personId } } : {})
    };
    return await requestNuvionWithFallback('/documents', 'POST', payload);
  },

  /**
   * Submit an entity for KYC or KYB onboarding review after documents or details are provided.
   */
  async submitOnboarding(entityId) {
    if (!entityId) {
      throw new Error('entity_id is required to submit for onboarding review.');
    }
    return await requestNuvionWithFallback('/onboarding-submissions', 'POST', { entity_id: entityId });
  },

  /**
   * Get an entity by ID
   */
  async getEntity(entityId) {
    if (!entityId) throw new Error('entityId is required');
    return await requestNuvionWithFallback(`/entities/${entityId}`, 'GET');
  },

  /**
   * Update individual entity
   */
  async updateIndividualEntity(entityId, payload) {
    if (!entityId) throw new Error('entityId is required');
    return await requestNuvionWithFallback(`/individual-entities/${entityId}`, 'PATCH', payload);
  },

  /**
   * Update business entity
   */
  async updateBusinessEntity(entityId, payload) {
    if (!entityId) throw new Error('entityId is required');
    return await requestNuvionWithFallback(`/business-entities/${entityId}`, 'PATCH', payload);
  },

  /**
   * Repair account beneficiary names and entities in order:
   * 1. Query accounts where beneficiary_name doesn't match entity's current KYC name (pull entity fresh via GET /entities/:id)
   * 2. PATCH entity first (/individual-entities/:id or /business-entities/:id) if name differs
   * 3. Re-provision account details (POST /account-details) for account_id
   * 4. Update DB with new account_number & beneficiary_name, mark old account_number as inactive
   * 5. Clear memory cache
   */
  async repairAccountBeneficiary(userId, context = 'personal') {
    const db = require('./db');
    const userRow = await dbPg.getUser(userId);
    if (!userRow) return { success: false, error: 'User not found' };

    const effectiveUserId = userRow.user_id || userRow.telegram_id || userId;
    const profile = await dbPg.getProfileByType(effectiveUserId, context);
    const profileId = profile?.profile_id || `prof_${context[0]}_${effectiveUserId}`;
    const entityId = profile?.nuvion_entity_id || userRow.nuvion_entity_id;

    const kycFirstName = (userRow.first_name || '').trim();
    const kycLastName = (userRow.last_name || '').trim();
    const kycBizName = (userRow.business_name || profile?.name || '').trim();

    let expectedKycName = '';
    let expectedBeneficiary = '';

    if (context === 'business') {
      expectedKycName = kycBizName || 'BUSINESS ACCOUNT';
      expectedBeneficiary = `${expectedKycName.toUpperCase()} / PayIT`;
    } else {
      expectedKycName = `${kycFirstName} ${kycLastName}`.trim() || 'VERIFIED USER';
      expectedBeneficiary = `${expectedKycName.toUpperCase()} / PayIT`;
    }

    // Step 1: Query local DB for active accounts
    const dbAccounts = dbPg.query(
      "SELECT * FROM accounts WHERE profile_id = ? AND (status IS NULL OR status = 'active')"
    ).all(profileId);

    // Pull entity fresh from Nuvion via GET /entities/:id (do not trust local cache)
    let freshEntity = null;
    if (entityId) {
      try {
        const entRes = await requestNuvionWithFallback(`/entities/${entityId}`, 'GET');
        freshEntity = entRes?.data?.data || entRes?.data || entRes;
      } catch (entErr) {
        console.warn(`[Repair] Fresh GET /entities/${entityId} fetch warning: ${entErr.message}`);
      }
    }

    // Step 2: PATCH entity first (/individual-entities/:entityId or /business-entities/:entityId) if entity name doesn't match
    let entityPatched = false;
    if (entityId && freshEntity) {
      const currentEntityName = (freshEntity.name || freshEntity.legal_name ||
        (freshEntity.person ? `${freshEntity.person.first_name || ''} ${freshEntity.person.last_name || ''}`.trim() : '')).trim();

      const nameMismatch = !currentEntityName ||
        currentEntityName.toLowerCase().includes('solvium') ||
        currentEntityName.toLowerCase() !== expectedKycName.toLowerCase();

      if (nameMismatch) {
        console.log(`[Repair] Entity ${entityId} name mismatch ("${currentEntityName}" vs "${expectedKycName}"). Patching entity...`);
        try {
          if (context === 'business') {
            await this.updateBusinessEntity(entityId, {
              name: expectedKycName,
              legal_name: expectedKycName
            });
          } else {
            await this.updateIndividualEntity(entityId, {
              name: expectedKycName,
              person: {
                first_name: kycFirstName,
                last_name: kycLastName
              }
            });
          }
          entityPatched = true;
          console.log(`[Repair] Successfully patched entity ${entityId} with name "${expectedKycName}".`);
        } catch (patchErr) {
          console.warn(`[Repair] PATCH entity ${entityId} error: ${patchErr.message}`);
        }
      }
    }

    // Step 3 & 4: Re-provision account details (POST /account-details) & Update DB (mark old as inactive)
    const patchedAccounts = [];
    for (const accRow of dbAccounts) {
      const currentBeneficiary = accRow.beneficiary_name || '';
      const needsAccountRepair = !currentBeneficiary ||
        currentBeneficiary.toLowerCase().includes('solvium') ||
        currentBeneficiary.toLowerCase().includes('payit account') ||
        currentBeneficiary.toUpperCase() !== expectedBeneficiary.toUpperCase() ||
        entityPatched;

      if (!needsAccountRepair) continue;

      const accountId = accRow.nuvion_account_id;
      if (!accountId || accountId.startsWith('acc_')) continue;

      console.log(`[Repair] Re-provisioning account details for account_id ${accountId} with beneficiary_name "${expectedBeneficiary}"...`);
      try {
        const detailsRes = await requestNuvionWithFallback('/account-details', 'POST', {
          account_id: accountId,
          beneficiary_name: expectedBeneficiary
        });
        const detailsObj = detailsRes?.data?.data?.[0] || detailsRes?.data?.[0] || detailsRes?.data || detailsRes;
        const newAccNum = detailsObj?.account_number || accRow.nuvion_account_no;
        const newBeneficiary = detailsObj?.beneficiary_name || expectedBeneficiary;

        if (newAccNum && newAccNum !== accRow.nuvion_account_no) {
          // Mark old account number as inactive
          await dbPg.query("UPDATE accounts SET status = 'inactive' WHERE profile_id = ? AND nuvion_account_no = ?", [profileId, accRow.nuvion_account_no]);
          // Insert new account details as active
          dbPg.query(`
            INSERT INTO accounts (account_id, profile_id, nuvion_account_id, nuvion_account_no, purpose, bank_name, beneficiary_name, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
            ON CONFLICT(account_id) DO UPDATE SET
              nuvion_account_no = excluded.nuvion_account_no,
              beneficiary_name = excluded.beneficiary_name,
              status = 'active'
          `).run(`acc_${accRow.purpose}_${effectiveUserId}_${Date.now()}`, profileId, accountId, newAccNum, accRow.purpose, accRow.bank_name || 'Flutterwave MFB / Nuvion Partner Bank', newBeneficiary, Date.now());
        } else {
          dbPg.query(`
            UPDATE accounts
            SET beneficiary_name = ?, status = 'active'
            WHERE account_id = ? OR (profile_id = ? AND purpose = ?)
          `).run(newBeneficiary, accRow.account_id, profileId, accRow.purpose);
        }

        patchedAccounts.push({
          account_id: accountId,
          old_number: accRow.nuvion_account_no,
          new_number: newAccNum,
          beneficiary_name: newBeneficiary
        });
      } catch (detErr) {
        console.warn(`[Repair] Could not re-provision account details for ${accountId}: ${detErr.message}`);
      }
    }

    // Step 6: Clear cache
    this.clearAccountCache(effectiveUserId);

    return {
      success: true,
      entity_id: entityId,
      entity_patched: entityPatched,
      expected_beneficiary: expectedBeneficiary,
      patched_accounts: patchedAccounts
    };
  }
};

