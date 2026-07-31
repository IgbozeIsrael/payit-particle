const { UniversalAccount, CHAIN_ID } = require('@particle-network/universal-account-sdk');
const { Wallet, getBytes, keccak256, toUtf8Bytes } = require('ethers');
require('dotenv').config();

/**
 * Particle Network Universal Account Service
 * Handles smart account creation, derivation, and transaction signing
 */
class ParticleService {
  constructor() {
    this.projectId = process.env.PARTICLE_PROJECT_ID;
    this.clientKey = process.env.PARTICLE_CLIENT_KEY;
    this.appId = process.env.PARTICLE_APP_UUID;
    
    this.universalAccounts = new Map(); // Cache UA instances by owner address
    this.wallets = new Map(); // Cache wallet instances by owner address
    
    this.validateConfig();
  }

  validateConfig() {
    if (!this.projectId || !this.clientKey || !this.appId) {
      console.warn('Particle Network credentials not fully configured. Falling back to simulation mode.');
      this.simulationMode = true;
    } else {
      this.simulationMode = false;
      console.log('Particle Network SDK initialized in production mode');
    }
  }

  /**
   * Get or create a Universal Account for a given owner address
   */
  async getUniversalAccount(ownerAddress) {
    if (this.simulationMode) {
      return this.getSimulatedAccount(ownerAddress);
    }

    if (this.universalAccounts.has(ownerAddress)) {
      return this.universalAccounts.get(ownerAddress);
    }

    try {
      const ua = new UniversalAccount({
        projectId: this.projectId,
        projectClientKey: this.clientKey,
        projectAppUuid: this.appId,
        ownerAddress: ownerAddress,
        smartAccountOptions: {
          useEIP7702: false, // Use Smart Account mode for compatibility
          name: 'PAYIT',
          version: '2.0.0'
        },
        tradeConfig: {
          slippageBps: 100, // 1% slippage
          universalGas: true // Use PART tokens for gas
        }
      });

      this.universalAccounts.set(ownerAddress, ua);
      return ua;
    } catch (error) {
      console.error('Failed to create Universal Account:', error.message);
      throw error;
    }
  }

  /**
   * Get or create a wallet for signing
   */
  getWallet(ownerAddress) {
    if (this.wallets.has(ownerAddress)) {
      return this.wallets.get(ownerAddress);
    }

    // In production, this would come from Particle Auth or encrypted storage
    // For now, we'll use a deterministic wallet based on the address
    const privateKey = process.env.MASTER_WALLET_PRIVATE_KEY;
    
    if (privateKey && privateKey !== '') {
      const wallet = new Wallet(privateKey);
      this.wallets.set(ownerAddress, wallet);
      return wallet;
    }

    // Fallback: derive a deterministic private key for local testing only.
    console.warn('No private key configured, using deterministic derivation for testing');
    const seed = `payit_test_${ownerAddress.toLowerCase()}_${this.projectId || 'dev'}`;
    const wallet = new Wallet(keccak256(toUtf8Bytes(seed)));
    this.wallets.set(ownerAddress, wallet);
    return wallet;
  }

  /**
   * Derive smart account addresses (Personal: index 0, Business: index 1)
   * This simulates Particle's smart account derivation
   */
  deriveSmartAccountAddress(ownerAddress, index) {
    const { ethers } = require('ethers');
    let validAddress = ownerAddress;
    if (!ownerAddress || !ethers.isAddress(ownerAddress)) {
      validAddress = '0x' + ethers.keccak256(ethers.toUtf8Bytes(String(ownerAddress || 'default'))).slice(26);
    }
    const salt = ethers.solidityPackedKeccak256(
      ["address", "uint256"],
      [validAddress, BigInt(index)]
    );
    
    const factoryAddress = '0x1534567890123456789012345678901234567890';
    const initCodeHash = ethers.solidityPackedKeccak256(
      ["string"],
      [`ParticleSmartAccount_Init_v1_${index}`]
    );
    
    return ethers.getCreate2Address(factoryAddress, salt, initCodeHash);
  }

  /**
   * Send a transaction using Particle Universal Account
   */
  async sendTransaction(ownerAddress, transaction) {
    if (this.simulationMode) {
      console.log('Simulation mode: Transaction would be sent via Particle Network');
      return { transactionId: 'simulated_' + Date.now() };
    }

    try {
      const ua = await this.getUniversalAccount(ownerAddress);
      const wallet = this.getWallet(ownerAddress);

      // Sign the transaction root hash
      const signature = await wallet.signMessage(getBytes(transaction.rootHash));

      // Send via Particle Network
      const result = await ua.sendTransaction(transaction, signature);
      
      console.log('Transaction sent via Particle Network:', result.transactionId);
      return result;
    } catch (error) {
      console.error('Failed to send transaction via Particle:', error.message);
      throw error;
    }
  }

  /**
   * Get unified balance across all chains
   */
  async getUnifiedBalance(ownerAddress) {
    const { isAddress } = require('ethers');
    if (!ownerAddress || !isAddress(ownerAddress)) {
      return {
        totalAmountInUSD: '0.00',
        assets: []
      };
    }

    if (this.simulationMode) {
      return {
        totalAmountInUSD: '0.00',
        assets: []
      };
    }

    try {
      const ua = await this.getUniversalAccount(ownerAddress);
      const primaryAssets = await ua.getPrimaryAssets();
      return {
        totalAmountInUSD: primaryAssets?.totalAmountInUSD != null ? String(primaryAssets.totalAmountInUSD) : '0.00',
        assets: primaryAssets?.assets || []
      };
    } catch (error) {
      console.error('Failed to get unified balance:', error.message);
      return {
        totalAmountInUSD: '0.00',
        assets: [],
        error: error.message
      };
    }
  }

  /**
   * Simulated account for development/testing without Particle credentials
   */
  getSimulatedAccount(ownerAddress) {
    const { ethers } = require('ethers');
    
    const personalAddress = this.deriveSmartAccountAddress(ownerAddress, 0);
    const businessAddress = this.deriveSmartAccountAddress(ownerAddress, 1);
    
    return {
      addresses: [personalAddress, businessAddress],
      ownerAddress,
      simulation: true
    };
  }

  /**
   * Check if running in simulation mode
   */
  isSimulationMode() {
    return this.simulationMode;
  }

  /**
   * Create a Particle Session Key for automated backend execution (e.g. card top-up, tax reserve)
   */
  async createParticleSessionKey(ownerAddress, options = {}) {
    const { maxAmountUsdc = 1000, durationDays = 30, allowedTargets = [] } = options;
    const expiresAt = Math.floor(Date.now() / 1000) + (durationDays * 86400);

    if (this.simulationMode) {
      const crypto = require('crypto');
      const sessionKeyAddress = '0x' + crypto.randomBytes(20).toString('hex');
      return {
        sessionKeyAddress,
        ownerAddress,
        maxAmountUsdc,
        expiresAt,
        allowedTargets,
        simulation: true
      };
    }

    try {
      const ua = await this.getUniversalAccount(ownerAddress);
      const sessionKey = await (ua.createSessions ? ua.createSessions({
        validUntil: expiresAt,
        validAfter: Math.floor(Date.now() / 1000),
        sessionKeyData: allowedTargets
      }) : Promise.resolve({ sessionKeyAddress: ownerAddress, expiresAt }));
      return sessionKey;
    } catch (err) {
      console.warn('[ParticleService] Session key creation fallback notice:', err.message);
      return {
        sessionKeyAddress: ownerAddress,
        expiresAt,
        error: err.message
      };
    }
  }
}

module.exports = new ParticleService();
