require('dotenv').config();

/**
 * TreasuryService
 * ---------------
 * Handles all server-side transaction signing for invoice sweeps and batch payouts.
 *
 * Modes (in priority order):
 *   1. Openfort TEE   – when OPENFORT_SECRET_KEY is set. Keys never touch app code.
 *   2. ethers.js EOA  – when MASTER_WALLET_PRIVATE_KEY is set. Existing behaviour.
 *   3. Simulation     – logs intent, marks invoice settled in DB only (no on-chain tx).
 */
class TreasuryService {
  constructor() {
    this.openfortKey    = process.env.OPENFORT_SECRET_KEY;
    this.openfortWalletSecret = process.env.OPENFORT_WALLET_SECRET;
    this.openfortAccountId    = process.env.OPENFORT_TREASURY_ACCOUNT_ID;
    this.openfortPolicyId     = process.env.OPENFORT_POLICY_ID;

    this.masterKey = process.env.MASTER_WALLET_PRIVATE_KEY;
    this.rpcUrl    = process.env.ARBITRUM_RPC || process.env.ARBITRUM_SEPOLIA_RPC || 'https://arb1.arbitrum.io/rpc';

    this._mode     = null; // lazy-determined on first use
    this._openfort = null;
    this._signer   = null;

    this._detectMode();
  }

  // ── Mode Detection ─────────────────────────────────────────────────────────

  _detectMode() {
    if (this.openfortKey && this.openfortWalletSecret && this.openfortAccountId) {
      this._mode = 'openfort';
      console.log('[Treasury] Mode: Openfort TEE (production-grade signing)');
    } else if (this.masterKey && this.masterKey.trim() !== '') {
      this._mode = 'ethers';
      console.log('[Treasury] Mode: ethers.js EOA signer (raw private key)');
    } else {
      this._mode = 'simulation';
      console.warn('[Treasury] Mode: Simulation (no signing keys configured). Transactions will be recorded in DB only.');
    }
  }

  get mode() { return this._mode; }
  get isSimulation() { return this._mode === 'simulation'; }

  // ── Openfort Client ────────────────────────────────────────────────────────

  _getOpenfort() {
    if (this._openfort) return this._openfort;
    try {
      // @openfort/openfort-node: npm install @openfort/openfort-node
      const Openfort = require('@openfort/openfort-node').default || require('@openfort/openfort-node');
      this._openfort = new Openfort(this.openfortKey, {
        walletSecret: this.openfortWalletSecret,
      });
      return this._openfort;
    } catch (err) {
      console.warn('[Treasury] @openfort/openfort-node not installed. Falling back to ethers signer. Run: npm install @openfort/openfort-node');
      this._mode = this.masterKey ? 'ethers' : 'simulation';
      return null;
    }
  }

  // ── ethers.js Signer ───────────────────────────────────────────────────────

  _getSigner() {
    if (this._signer) return this._signer;
    const { ethers } = require('ethers');
    const provider = new ethers.JsonRpcProvider(this.rpcUrl);
    this._signer = new ethers.Wallet(this.masterKey, provider);
    return this._signer;
  }

  // ── Core: Sign & Send ──────────────────────────────────────────────────────

  /**
   * Sign and send a single transaction.
   *
   * @param {object} params
   * @param {string} params.to         - Recipient contract address
   * @param {string} params.data       - ABI-encoded calldata (hex)
   * @param {string} [params.value]    - ETH value in wei (default '0')
   * @param {string} [params.invoiceId]- For logging/event correlation
   * @returns {Promise<{txHash: string|null, simulated: boolean, mode: string}>}
   */
  async signAndSend({ to, data, value = '0', invoiceId = '' }) {
    const tag = invoiceId ? ` [${invoiceId}]` : '';

    // ── Openfort TEE Mode ──────────────────────────────────────────────────
    if (this._mode === 'openfort') {
      const openfort = this._getOpenfort();
      if (!openfort) return this.signAndSend({ to, data, value, invoiceId }); // retried after mode downgrade

      try {
        console.log(`[Treasury]${tag} Sending via Openfort TEE → ${to}`);

        const txParams = {
          interactions: [{
            contract: to,
            functionName: '',   // raw calldata — Openfort accepts raw `data`
            functionArgs: [],
            value: value,
            data: data,
          }],
        };

        if (this.openfortPolicyId) {
          txParams.policy = this.openfortPolicyId;
        }

        const result = await openfort.accounts.evm.backend.transact(
          this.openfortAccountId,
          txParams,
        );

        const txHash = result?.transactionIntentId || result?.hash || null;
        console.log(`[Treasury]${tag} Openfort tx submitted: ${txHash}`);
        return { txHash, simulated: false, mode: 'openfort' };

      } catch (err) {
        console.error(`[Treasury]${tag} Openfort signAndSend failed:`, err.message);
        throw err;
      }
    }

    // ── ethers.js EOA Mode ─────────────────────────────────────────────────
    if (this._mode === 'ethers') {
      try {
        const signer = this._getSigner();
        console.log(`[Treasury]${tag} Sending via ethers.js EOA → ${to}`);
        const tx = await signer.sendTransaction({ to, data, value: BigInt(value || '0') });
        const receipt = await tx.wait();
        console.log(`[Treasury]${tag} ethers.js tx confirmed: ${receipt.hash}`);
        return { txHash: receipt.hash, simulated: false, mode: 'ethers' };
      } catch (err) {
        console.error(`[Treasury]${tag} ethers.js signAndSend failed:`, err.message);
        throw err;
      }
    }

    // ── Simulation Mode ────────────────────────────────────────────────────
    console.log(`[Treasury]${tag} SIMULATION — would send tx to ${to} with ${data.slice(0, 20)}…`);
    return { txHash: null, simulated: true, mode: 'simulation' };
  }

  // ── Batch Sweep ───────────────────────────────────────────────────────────

  /**
   * Execute multiple sweep calls atomically (or sequentially in ethers/simulation mode).
   *
   * @param {Array<{to, data, invoiceId}>} calls
   * @returns {Promise<Array<{txHash, simulated, mode}>>}
   */
  async sendBatchSweep(calls) {
    if (!calls || calls.length === 0) return [];

    // Openfort: bundle into a single transaction intent with multiple interactions
    if (this._mode === 'openfort') {
      const openfort = this._getOpenfort();
      if (openfort) {
        try {
          console.log(`[Treasury] Batch sweep (${calls.length} invoices) via Openfort TEE`);
          const interactions = calls.map(c => ({
            contract: c.to,
            functionName: '',
            functionArgs: [],
            data: c.data,
            value: '0',
          }));
          const txParams = { interactions };
          if (this.openfortPolicyId) txParams.policy = this.openfortPolicyId;

          const result = await openfort.accounts.evm.backend.transact(
            this.openfortAccountId,
            txParams,
          );
          const txHash = result?.transactionIntentId || result?.hash || null;
          console.log(`[Treasury] Batch Openfort tx: ${txHash}`);
          return calls.map(() => ({ txHash, simulated: false, mode: 'openfort' }));
        } catch (err) {
          console.error('[Treasury] Batch Openfort sweep failed:', err.message);
          throw err;
        }
      }
    }

    // ethers/simulation: sequential
    const results = [];
    for (const call of calls) {
      const result = await this.signAndSend(call);
      results.push(result);
    }
    return results;
  }

  // ── Policy Initialization ─────────────────────────────────────────────────

  /**
   * Register/update Openfort Transaction Policies for treasury protection.
   * Called once at server startup. No-op in non-Openfort modes.
   */
  async initializePolicies() {
    if (this._mode !== 'openfort') return;
    const openfort = this._getOpenfort();
    if (!openfort) return;

    try {
      console.log('[Treasury] Checking Openfort Transaction Policies…');

      // If OPENFORT_POLICY_ID is already set, assume policy exists — skip creation.
      if (this.openfortPolicyId) {
        console.log(`[Treasury] Using existing policy: ${this.openfortPolicyId}`);
        return;
      }

      // Create a protective policy via Openfort API
      // (Policy API shape subject to Openfort SDK version — this targets v1.6+)
      const policy = await openfort.policies.create({
        name: 'PayIT Treasury Policy',
        chainId: 421614, // Arbitrum Sepolia
        strategy: {
          sponsorSchema: 'pay_for_user',
          // Restrict to USDC contract calls only
          allowedContracts: [
            '0x75FAf114eAFb1bdBE23224ec7530404B110a4235', // USDC Arbitrum Sepolia
            process.env.INVOICE_FACTORY_ADDRESS,
          ].filter(Boolean),
        },
        // Rate limit: max 100 tx per hour
        rateLimitPerHour: 100,
        // Per-transaction cap: max 10,000 USDC worth of gas sponsored
        globalMaxValueUsd: 10000,
      });

      console.log(`[Treasury] Openfort policy created: ${policy?.id}`);
      console.log('[Treasury] ⚠️  Set OPENFORT_POLICY_ID=' + (policy?.id || 'unknown') + ' in your .env to persist this policy.');

    } catch (err) {
      // Non-fatal — policy creation is a best-effort safety measure
      console.warn('[Treasury] Could not initialize Openfort policy (non-fatal):', err.message);
    }
  }

  // ── Address Getter ────────────────────────────────────────────────────────

  /**
   * Get the treasury wallet's public address (for funding/monitoring purposes).
   */
  async getAddress() {
    if (this._mode === 'openfort') {
      const openfort = this._getOpenfort();
      if (openfort && this.openfortAccountId) {
        try {
          const account = await openfort.accounts.get(this.openfortAccountId);
          return account?.address || null;
        } catch (_) {}
      }
    }
    if (this._mode === 'ethers') {
      return this._getSigner().address;
    }
    return null;
  }
}

module.exports = new TreasuryService();
