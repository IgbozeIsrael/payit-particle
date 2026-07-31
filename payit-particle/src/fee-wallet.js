require('dotenv').config();

const DEFAULT_TREASURY = '0x62f0072F397Eb73D75da7502F5E9394a83C450b9';

/**
 * Platform fee wallet — all service fees route here.
 * Uses TREASURY_ADDRESS / FEE_WALLET_ADDRESS from env.
 */
function getFeeWalletAddress() {
  return (
    process.env.FEE_WALLET_ADDRESS ||
    process.env.TREASURY_ADDRESS ||
    DEFAULT_TREASURY
  );
}

function recordPlatformFee(db, { userId, txId, amountUsdt, feeAddress, sourceCurrency, payoutAmount, note }) {
  if (!db || typeof db.recordPlatformFee !== 'function') {
    return null;
  }
  return db.recordPlatformFee({
    userId,
    txId: txId || null,
    amountUsdt: amountUsdt || 0,
    feeAddress: feeAddress || getFeeWalletAddress(),
    sourceCurrency: sourceCurrency || 'USDC',
    payoutAmount: payoutAmount || 0,
    note: note || null
  });
}

module.exports = {
  getFeeWalletAddress,
  recordPlatformFee
};
