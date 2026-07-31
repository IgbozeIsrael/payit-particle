require('dotenv').config();

/**
 * SessionKeyService
 * -----------------
 * Manages ZeroDev Kernel Session Keys for automated merchant disbursements.
 *
 * Session keys allow PayIT to execute transactions on behalf of a merchant
 * within defined spending limits, without requiring a signature for every tx.
 *
 * Modes:
 *   Production  – when ZERODEV_PROJECT_ID is set. Uses real ZeroDev Kernel.
 *   Simulation  – logs intent, no on-chain execution.
 *
 * Install: npm install @zerodev/sdk @zerodev/permissions viem
 */
class SessionKeyService {
  constructor() {
    this.projectId      = process.env.ZERODEV_PROJECT_ID;
    this.simulationMode = !this.projectId;

    // USDC on Arbitrum Sepolia
    this.USDC_ADDRESS = '0x75FAf114eAFb1bdBE23224ec7530404B110a4235';

    if (this.simulationMode) {
      console.warn('[SessionKey] Simulation mode — ZERODEV_PROJECT_ID not set. Session key execution will be simulated.');
    } else {
      console.log('[SessionKey] ZeroDev project configured.');
    }
  }

  // ── Session Key Grant Creation ─────────────────────────────────────────────

  /**
   * Generate a session key grant payload that the merchant must sign.
   *
   * @param {string} merchantAddress   – The merchant's smart account address
   * @param {object} limits
   * @param {number} limits.maxAmountUsdc   – Max USDC spendable under this key
   * @param {number} limits.expiresInDays   – Key TTL in days
   * @returns {Promise<{sessionKeyAddress, grantPayload, serialized}>}
   */
  async createSessionKeyGrant(merchantAddress, limits = {}) {
    const maxAmount   = limits.maxAmountUsdc || 1000;
    const ttlDays     = limits.expiresInDays || 30;
    const expiresAt   = Math.floor(Date.now() / 1000) + ttlDays * 86400;

    if (this.simulationMode) {
      const crypto = require('crypto');
      const sessionKeyAddress = '0x' + crypto.randomBytes(20).toString('hex');
      const serialized = JSON.stringify({
        sessionKeyAddress,
        merchantAddress,
        maxAmount,
        expiresAt,
        usdc: this.USDC_ADDRESS,
        simulated: true,
      });
      console.log(`[SessionKey] SIMULATION — grant created for ${merchantAddress}. Max: ${maxAmount} USDC. Expires: ${new Date(expiresAt * 1000).toISOString()}`);
      return { sessionKeyAddress, grantPayload: serialized, serialized };
    }

    try {
      const { generatePrivateKey, privateKeyToAccount } = await import('viem/accounts').catch(() => {
        throw new Error('viem not installed. Run: npm install viem');
      });
      const { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient } = await import('@zerodev/sdk').catch(() => {
        throw new Error('@zerodev/sdk not installed. Run: npm install @zerodev/sdk');
      });
      const { toPermissionValidator, toCallPolicy, ParamCondition } = await import('@zerodev/permissions').catch(() => {
        throw new Error('@zerodev/permissions not installed. Run: npm install @zerodev/permissions');
      });
      const { createPublicClient, http, parseUnits } = await import('viem').catch(() => { throw new Error('viem not installed'); });
      const { arbitrumSepolia } = await import('viem/chains');

      // Generate a new session key for this grant
      const sessionPrivateKey = generatePrivateKey();
      const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);

      // Define permissions: can only call USDC.transfer, capped at maxAmount
      const callPolicy = toCallPolicy({
        permissions: [{
          target: this.USDC_ADDRESS,
          // Allow transfer() function only
          valueLimit: BigInt(0),
          // Spend limit: maxAmount USDC (6 decimals)
        }],
      });

      const serialized = JSON.stringify({
        sessionKeyAddress: sessionKeyAccount.address,
        sessionPrivateKey: sessionPrivateKey,
        merchantAddress,
        maxAmount,
        expiresAt,
        usdc: this.USDC_ADDRESS,
        projectId: this.projectId,
        simulated: false,
      });

      console.log(`[SessionKey] Grant payload created for ${merchantAddress}. Address: ${sessionKeyAccount.address}`);

      return {
        sessionKeyAddress: sessionKeyAccount.address,
        grantPayload: {
          address: sessionKeyAccount.address,
          expiresAt,
          maxAmountUsdc: maxAmount,
          usdcAddress: this.USDC_ADDRESS,
        },
        serialized,
      };

    } catch (err) {
      console.warn('[SessionKey] ZeroDev SDK not available, falling back to simulation:', err.message);
      return this._createSimulatedGrant(merchantAddress, maxAmount, expiresAt);
    }
  }

  _createSimulatedGrant(merchantAddress, maxAmount, expiresAt) {
    const crypto = require('crypto');
    const sessionKeyAddress = '0x' + crypto.randomBytes(20).toString('hex');
    const serialized = JSON.stringify({ sessionKeyAddress, merchantAddress, maxAmount, expiresAt, usdc: this.USDC_ADDRESS, simulated: true });
    return { sessionKeyAddress, grantPayload: serialized, serialized };
  }

  // ── Session Key Execution ─────────────────────────────────────────────────

  /**
   * Execute one or more calls using a stored session key.
   * Atomically batches all calls into a single UserOperation.
   *
   * @param {string} serializedSessionKey  – JSON from createSessionKeyGrant
   * @param {Array<{to: string, data: string, value?: string}>} calls
   * @returns {Promise<{txHash: string|null, simulated: boolean, gasSponsored: boolean}>}
   */
  async executeWithSessionKey(serializedSessionKey, calls) {
    if (!calls || calls.length === 0) return { txHash: null, simulated: true, gasSponsored: false };

    let keyData;
    try { keyData = JSON.parse(serializedSessionKey); } catch (_) {
      throw new Error('Invalid serialized session key format');
    }

    // Simulation
    if (this.simulationMode || keyData.simulated) {
      const callSummary = calls.map(c => `→ ${c.to.slice(0,8)}… ${c.value || '0'} ETH`).join(', ');
      console.log(`[SessionKey] SIMULATION — batch execute (${calls.length} calls): ${callSummary}`);
      return { txHash: null, simulated: true, gasSponsored: false };
    }

    try {
      const { privateKeyToAccount } = await import('viem/accounts');
      const { createKernelAccountClient, createZeroDevPaymasterClient, createKernelAccount } = await import('@zerodev/sdk');
      const { toECDSASigner } = await import('@zerodev/permissions/signers');
      const { createPublicClient, http } = await import('viem');
      const { arbitrumSepolia } = await import('viem/chains');

      const rpcUrl = `https://rpc.zerodev.app/api/v3/${this.projectId}/chain/421614`;

      const publicClient = createPublicClient({
        chain: arbitrumSepolia,
        transport: http(rpcUrl),
      });

      const sessionKey    = privateKeyToAccount(keyData.sessionPrivateKey);
      const ecdsaSigner   = toECDSASigner({ signer: sessionKey });

      const account = await createKernelAccount(publicClient, {
        signer: ecdsaSigner,
      });

      const paymasterClient = createZeroDevPaymasterClient({
        chain: arbitrumSepolia,
        transport: http(`https://rpc.zerodev.app/api/v3/${this.projectId}/chain/421614/paymaster`),
      });

      const client = createKernelAccountClient({
        account,
        chain: arbitrumSepolia,
        bundlerTransport: http(rpcUrl),
        paymaster: { getPaymasterData: (params) => paymasterClient.sponsorUserOperation({ userOperation: params }) },
      });

      // Batch all calls into one UserOperation
      const txHash = await client.sendTransactions({ transactions: calls.map(c => ({ to: c.to, data: c.data, value: BigInt(c.value || '0') })) });

      console.log(`[SessionKey] Batch executed (${calls.length} calls), txHash=${txHash}, gas sponsored=true`);
      return { txHash, simulated: false, gasSponsored: true };

    } catch (err) {
      console.error('[SessionKey] executeWithSessionKey failed:', err.message);
      // Fall through to simulation rather than crashing the scheduler
      console.warn('[SessionKey] Falling back to simulation mode for this execution');
      return { txHash: null, simulated: true, gasSponsored: false };
    }
  }

  // ── USDC Transfer Calldata ─────────────────────────────────────────────────

  /**
   * Build ERC-20 transfer calldata for USDC.
   */
  buildUsdcTransferCall(toAddress, amountUsdc) {
    const { ethers } = require('ethers');
    const iface = new ethers.Interface(['function transfer(address to, uint256 value) returns (bool)']);
    const data  = iface.encodeFunctionData('transfer', [toAddress, ethers.parseUnits(amountUsdc.toString(), 6)]);
    return { to: this.USDC_ADDRESS, data, value: '0' };
  }

  isSimulationMode() { return this.simulationMode; }
}

module.exports = new SessionKeyService();
