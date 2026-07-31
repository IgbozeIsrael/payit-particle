const crypto = require('crypto');
const { ethers } = require('ethers');
const particleService = require('./particle-service');
require('dotenv').config();

const KEY_ENC_SECRET = process.env.KEY_ENCRYPTION_SECRET;
if (process.env.NODE_ENV === 'production') {
  if (!KEY_ENC_SECRET || KEY_ENC_SECRET === 'payit_default_master_encryption_secret_key_32b') {
    console.error('[FATAL] KEY_ENCRYPTION_SECRET must be set in production environment');
    process.exit(1);
  }
} else {
  if (!KEY_ENC_SECRET) {
    console.warn('[Warning] KEY_ENCRYPTION_SECRET not set; using insecure default for development. Set KEY_ENCRYPTION_SECRET in production.');
  }
}

/**
 * Get the master wallet from environment private key or generate a new one.
 * In production, this uses Particle Network Universal Accounts.
 */
function getMasterWallet() {
  // If Particle Network is configured, we don't need traditional private keys
  if (!particleService.isSimulationMode()) {
    console.log('Using Particle Network Universal Accounts - traditional wallet not needed');
    // Return a placeholder - actual signing happens via Particle
    return {
      address: '0x0000000000000000000000000000000000000000', // Placeholder
      privateKey: null, // Managed by Particle Network
      particleManaged: true
    };
  }

  // Fallback to traditional wallet for simulation mode
  const privateKey = process.env.MASTER_WALLET_PRIVATE_KEY;
  
  if (privateKey && privateKey !== '') {
    try {
      const wallet = new ethers.Wallet(privateKey);
      return {
        address: wallet.address,
        privateKey: wallet.privateKey
      };
    } catch (error) {
      console.error('Invalid private key in environment, generating new wallet:', error.message);
      return generateWallet();
    }
  }
  
  // Fallback to random wallet for development/testing
  return generateWallet();
}

/**
 * Generate a new random master EOA wallet.
 */
function generateWallet() {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey
  };
}

/**
 * Derives Particle Network Smart Account addresses
 * Derivation Index 0: Personal Smart Account
 * Derivation Index 1: Business Smart Account
 * Uses Particle Network Universal Account SDK when available
 */
function deriveSmartAccountAddress(eoaAddress, index) {
  // Use Particle Network service for actual smart account derivation
  return particleService.deriveSmartAccountAddress(eoaAddress, index);
}

/**
 * Encrypt a private key using a 4-digit PIN.
 */
function encryptPrivateKey(privateKey, pin) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);

  const key = crypto.scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 });

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encryptedBlob: encrypted,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

/**
 * Decrypt a private key using the 4-digit PIN and encryption metadata.
 */
function decryptPrivateKey(encryptedData, pin) {
  const { encryptedBlob, salt, iv, authTag } = encryptedData;

  const saltBuf = Buffer.from(salt, 'hex');
  const ivBuf = Buffer.from(iv, 'hex');
  const authTagBuf = Buffer.from(authTag, 'hex');

  const key = crypto.scryptSync(pin, saltBuf, 32, { N: 16384, r: 8, p: 1 });

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf);
  decipher.setAuthTag(authTagBuf);

  let decrypted = decipher.update(encryptedBlob, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypt a system private key for storage at rest.
 */
function encryptSystemKey(privateKey) {
  if (!privateKey) return null;
  if (typeof privateKey !== 'string') return privateKey;
  if (privateKey.startsWith('enc_v1:')) return privateKey; // already encrypted

  const secret = process.env.KEY_ENCRYPTION_SECRET || ((process.env.NODE_ENV === 'development' || process.env.DEV_MODE === 'true') ? 'dev_key_encryption_secret_32bytes_len!' : null);
  if (!secret) {
    throw new Error('[Security] KEY_ENCRYPTION_SECRET must be set. Refusing to encrypt with default key.');
  }
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 1 });

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `enc_v1:${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a system private key stored at rest.
 */
function decryptSystemKey(encryptedStr) {
  if (!encryptedStr || typeof encryptedStr !== 'string') return encryptedStr;
  if (!encryptedStr.startsWith('enc_v1:')) {
    // Legacy unencrypted key — warn but return as-is for backward compat
    console.warn('[Security] Encountered legacy unencrypted key. It should be re-encrypted.');
    return encryptedStr;
  }

  try {
    const parts = encryptedStr.split(':');
    if (parts.length !== 5) return encryptedStr;
    const [, saltHex, ivHex, authTagHex, blobHex] = parts;
    const secret = process.env.KEY_ENCRYPTION_SECRET || ((process.env.NODE_ENV === 'development' || process.env.DEV_MODE === 'true') ? 'dev_key_encryption_secret_32bytes_len!' : null);
    if (!secret) {
      console.error('[Security] KEY_ENCRYPTION_SECRET is not set. Cannot decrypt key.');
      return null;
    }
    const saltBuf = Buffer.from(saltHex, 'hex');
    const ivBuf = Buffer.from(ivHex, 'hex');
    const authTagBuf = Buffer.from(authTagHex, 'hex');

    const key = crypto.scryptSync(secret, saltBuf, 32, { N: 16384, r: 8, p: 1 });
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf);
    decipher.setAuthTag(authTagBuf);

    let decrypted = decipher.update(blobHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.warn('[Security] Failed to decrypt system key:', err.message);
    return null;
  }
}

/**
 * Derives a valid ED25519 Base58 Solana public key address
 */
function deriveSolanaAddress(identifier, context = 'business') {
  try {
    const solana = require('@solana/web3.js');
    const seed = crypto.createHash('sha256').update(`payit_solana_${context}_${identifier || 'dev'}`).digest();
    const keypair = solana.Keypair.fromSeed(seed);
    return keypair.publicKey.toBase58();
  } catch (e) {
    console.warn('[Solana] Failed to derive Solana keypair, fallback:', e.message);
    return '4k3Dyjzv5pM6K7G8H9J0L1M2N3P4Q5R6S7T8U9V0W1X';
  }
}

module.exports = {
  getMasterWallet,
  generateWallet,
  deriveSmartAccountAddress,
  deriveSolanaAddress,
  encryptPrivateKey,
  decryptPrivateKey,
  encryptSystemKey,
  decryptSystemKey
};


