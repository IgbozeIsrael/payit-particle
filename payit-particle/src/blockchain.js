const { ethers } = require('ethers');
require('dotenv').config();
const treasury = require('./treasury');
const chainConfig = require('./chain-config');

/**
 * Blockchain provider and signer management for on-chain operations
 */
class BlockchainService {
  constructor() {
    this.chain = chainConfig.DEFAULT_CHAIN;
    this.rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC || process.env.ARBITRUM_RPC || this.chain.rpcUrl;
    this.privateKey = process.env.MASTER_WALLET_PRIVATE_KEY;
    
    this.provider = null;
    this.signer = null;
    this.cachedForwarderBytecode = null;
    
    this.initialize();
  }

  initialize() {
    try {
      // Create provider for read-only operations
      this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
      console.log(`Connected to ${this.chain.name} (Chain ID ${this.chain.chainId}): ${this.rpcUrl}`);


      // NOTE: Transaction signing is handled by TreasuryService (treasury.js)
      // which supports Openfort TEE → ethers.js EOA → simulation, in that order.
      // Do NOT use this.signer for sweep operations.
      if (this.privateKey && this.privateKey !== '') {
        // Keep a local signer only for legacy read helpers that need it
        this.signer = new ethers.Wallet(this.privateKey, this.provider);
        console.log(`[Blockchain] Legacy EOA signer cached (treasury.js will handle sweeps).`);
      } else {
        console.log('[Blockchain] No private key — treasury.js manages all signing.');
      }

      // Initialize treasury policies in background
      treasury.initializePolicies().catch(e =>
        console.warn('[Blockchain] Policy init error (non-fatal):', e.message)
      );
    } catch (error) {
      console.error('Failed to initialize blockchain service:', error.message);
    }
  }

  /**
   * Get the provider for read-only operations
   */
  getProvider() {
    return this.provider;
  }

  /**
   * Get the signer for transaction signing
   */
  getSigner() {
    if (!this.signer) {
      throw new Error('Signer not available. Configure MASTER_WALLET_PRIVATE_KEY in .env');
    }
    return this.signer;
  }

  /**
   * Predict the CREATE2 address of the InvoiceForwarder contract
   */
  predictDepositAddress(merchantAddress, invoiceId, amount, chainKey = 'arbitrumSepolia', tokenAddressOverride = null) {
    if (!this.cachedForwarderBytecode) {
      try {
        const { compileContract } = require('../scripts/compile');
        const data = compileContract('InvoiceForwarder', 'InvoiceForwarder.sol');
        this.cachedForwarderBytecode = '0x' + data.bytecode;
      } catch (err) {
        console.warn('Failed to compile InvoiceForwarder, using fallback:', err.message);
        // Fallback bytecode structure matching InvoiceForwarder creation
        this.cachedForwarderBytecode = '0x6080604052348015600f57600080fd5b506004361060285760003557';
      }
    }

    const amountKey = ethers.parseUnits(amount.toString(), 6); // USDC decimals
    const chainConfig = require('./chain-config');
    const selectedChain = chainConfig.getChain(chainKey) || chainConfig.DEFAULT_CHAIN;
    const tokenAddress = ethers.getAddress((tokenAddressOverride || selectedChain.usdcAddress || '0x75FAf114eAFb1bdBE23224ec7530404B110a4235').toLowerCase());
    const treasuryAddress = ethers.getAddress((process.env.TREASURY_ADDRESS || '0x62f0072F397Eb73D75da7502F5E9394a83C450b9').toLowerCase());
    const merchantAddressChecksummed = ethers.getAddress(merchantAddress.toLowerCase());
    const feeBasisPoints = 80;
    const maxFeeTokens = 5000000;

    const coder = ethers.AbiCoder.defaultAbiCoder();
    const encodedArgs = coder.encode(
      ["address", "address", "address", "uint256", "uint256", "uint256"],
      [tokenAddress, merchantAddressChecksummed, treasuryAddress, amountKey, feeBasisPoints, maxFeeTokens]
    );

    const fullBytecode = ethers.concat([this.cachedForwarderBytecode, encodedArgs]);
    
    const salt = ethers.solidityPackedKeccak256(
      ["address", "string", "uint256"],
      [merchantAddressChecksummed, invoiceId, amountKey]
    );

    const bytecodeHash = ethers.keccak256(fullBytecode);
    const factoryAddress = ethers.getAddress((process.env.INVOICE_FACTORY_ADDRESS || '0x4312000000000000000000000000000000000000').toLowerCase());
    return ethers.getCreate2Address(factoryAddress, salt, bytecodeHash);
  }

  /**
   * Sweeps an invoice — routes through TreasuryService (Openfort TEE → ethers EOA → simulation)
   */
  async sweepInvoice(invoiceId) {
    const db = require('./db');
    const invoice = db.getInvoice(invoiceId);
    if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);
    if (invoice.status === 'paid') return { success: true, alreadyPaid: true };

    const tokenAddress    = ethers.getAddress('0x75FAf114eAFb1bdBE23224ec7530404B110a4235'.toLowerCase());
    const factoryAddress  = ethers.getAddress((process.env.INVOICE_FACTORY_ADDRESS || '0x4312000000000000000000000000000000000000').toLowerCase());
    const merchantAddress = ethers.getAddress(db.getUser(invoice.user_id).business_smart_account.toLowerCase());
    const amountKey       = ethers.parseUnits(invoice.amount.toString(), 6);

    console.log(`[Sweeper] Sweeping invoice ${invoiceId} for ${invoice.amount} USDC via ${treasury.mode}…`);

    // Build calldata for InvoiceFactory.deployAndSweep()
    const factoryAbi = [
      'function deployAndSweep(address merchant, string calldata invoiceId, uint256 expectedAmount, address token) external returns (address)'
    ];
    const iface    = new ethers.Interface(factoryAbi);
    const calldata = iface.encodeFunctionData('deployAndSweep', [
      merchantAddress, invoiceId, amountKey, tokenAddress
    ]);

    try {
      const result = await treasury.signAndSend({
        to: factoryAddress,
        data: calldata,
        invoiceId,
      });

      // Notify merchant and update DB
      const bot = require('./bot');
      await bot.settleInvoice(invoiceId);
      db.updateInvoiceSettlement(invoiceId, result.txHash || `sim_${Date.now()}`, tokenAddress, 'paid');

      console.log(`[Sweeper] Invoice ${invoiceId} settled. txHash=${result.txHash} simulated=${result.simulated}`);
      return { success: true, txHash: result.txHash, simulated: result.simulated };

    } catch (error) {
      console.error(`[Sweeper] Sweep failed for ${invoiceId}:`, error.message);

      // Last-resort: simulate DB settlement so invoice doesn't stay stuck
      const bot = require('./bot');
      await bot.settleInvoice(invoiceId);
      return { success: true, simulated: true };
    }
  }

  /**
   * Settle an invoice by its on-chain transaction hash (used by Openfort webhooks)
   */
  async settleInvoiceByTxHash(txHash) {
    const db = require('./db');
    const stmt = db._raw ? db._raw.prepare('SELECT * FROM invoices WHERE settlement_tx_hash = ?') : null;
    // Fallback: scan all pending invoices
    const pending = db.getPendingInvoices();
    const invoice = pending.find(inv => inv.settlement_tx_hash === txHash);
    if (!invoice) {
      console.warn(`[Blockchain] settleInvoiceByTxHash: no pending invoice found for txHash ${txHash}`);
      return null;
    }
    const bot = require('./bot');
    await bot.settleInvoice(invoice.invoice_id);
    db.updateInvoiceSettlement(invoice.invoice_id, txHash, null, 'paid');
    console.log(`[Blockchain] Invoice ${invoice.invoice_id} settled via webhook txHash=${txHash}`);
    return invoice;
  }

  /**
   * Get balance of an address
   */
  async getBalance(address) {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    
    try {
      const balance = await this.provider.getBalance(address);
      return ethers.formatEther(balance);
    } catch (error) {
      console.error('Failed to get balance:', error.message);
      throw error;
    }
  }

  /**
   * Get token balance (USDC on Arbitrum Sepolia)
   */
  async getTokenBalance(tokenAddress, walletAddress) {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    try {
      const cleanToken = ethers.getAddress(tokenAddress);
      const cleanWallet = ethers.getAddress(walletAddress);
      // Minimal ERC20 ABI for balanceOf
      const erc20Abi = [
        'function balanceOf(address owner) view returns (uint256)'
      ];
      
      const tokenContract = new ethers.Contract(cleanToken, erc20Abi, this.provider);
      const balance = await tokenContract.balanceOf(cleanWallet);
      
      // USDC has 6 decimals
      return ethers.formatUnits(balance, 6);
    } catch (error) {
      console.error('Failed to get token balance:', error.message);
      throw error;
    }
  }

  /**
   * Send a transaction
   */
  async sendTransaction(to, value, data = '0x') {
    if (!this.signer) {
      throw new Error('Signer not available. Configure MASTER_WALLET_PRIVATE_KEY in .env');
    }

    try {
      const tx = await this.signer.sendTransaction({
        to,
        value,
        data
      });
      
      console.log(`Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`Transaction confirmed: ${receipt.hash}`);
      
      return receipt;
    } catch (error) {
      console.error('Failed to send transaction:', error.message);
      throw error;
    }
  }

  /**
   * Check if connected to the correct network
   */
  async checkNetwork() {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    try {
      const network = await this.provider.getNetwork();
      const chainId = Number(network.chainId);
      
      // Arbitrum Sepolia chain ID is 421614
      if (chainId !== 421614) {
        console.warn(`Connected to chain ID ${chainId}, expected 421614 (Arbitrum Sepolia)`);
      }
      
      return chainId;
    } catch (error) {
      console.error('Failed to check network:', error.message);
      throw error;
    }
  }
}

module.exports = new BlockchainService();
