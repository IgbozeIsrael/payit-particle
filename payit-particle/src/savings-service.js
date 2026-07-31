const crypto = require('crypto');
const db = require('./db');
const yieldService = require('./yield-service');
const feeWallet = require('./fee-wallet');

function addDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function formatDuration(days) {
  if (days >= 365) return `${Math.round(days / 365)} year(s)`;
  if (days >= 30) return `${Math.round(days / 30)} month(s)`;
  return `${days} day(s)`;
}

class SavingsService {
  async createLock({ telegramId, walletContext, amount, currency, durationDays, type = 'lock' }) {
    const lockId = `sav_${crypto.randomUUID().slice(0, 8)}`;
    let marketApy = 0;
    let userApy = 0;
    let platformApy = 0;
    let yieldPool = null;

    if (type === 'yield') {
      const best = await yieldService.getBestStablecoinYield();
      marketApy = best.marketApy;
      userApy = best.userApy;
      platformApy = best.platformApy;
      yieldPool = best.pool ? JSON.stringify(best.pool) : null;
    }

    const unlockAt = addDays(durationDays);
    db.createSavingsLock({
      lockId,
      userId: telegramId,
      walletContext,
      type,
      amount,
      currency: currency || 'USDC',
      durationDays,
      unlockAt,
      marketApy,
      userApy,
      platformApy,
      yieldPool,
      status: 'active'
    });

    if (type === 'yield' && platformApy > 0) {
      const split = yieldService.estimateYieldSplit(amount, marketApy);
      feeWallet.recordPlatformFee(db, {
        userId: telegramId,
        txId: lockId,
        amountUsdt: split.platformAnnual,
        feeAddress: feeWallet.getFeeWalletAddress(),
        sourceCurrency: currency || 'USDC',
        payoutAmount: 0,
        note: `Reserved platform yield spread (${platformApy.toFixed(2)}% APY) on ${lockId}`
      });
    }

    return {
      lockId,
      type,
      amount,
      currency: currency || 'USDC',
      durationDays,
      unlockAt,
      marketApy,
      userApy,
      platformApy,
      yieldPool: yieldPool ? JSON.parse(yieldPool) : null
    };
  }

  listActive(telegramId, walletContext) {
    return db.getActiveSavingsLocks(telegramId, walletContext);
  }

  async applyInvoiceAutoSave({ telegramId, invoiceId, invoiceAmount, currency }) {
    const user = db.getUser(telegramId);
    if (!user || !user.auto_save_percent || user.auto_save_percent <= 0) {
      return null;
    }

    const saveAmount = Number((invoiceAmount * (user.auto_save_percent / 100)).toFixed(6));
    if (saveAmount <= 0) {
      return null;
    }

    const saveType = user.auto_save_type || 'lock';
    const durationDays = user.auto_save_duration_days || 30;
    const lock = await this.createLock({
      telegramId,
      walletContext: 'business',
      amount: saveAmount,
      currency,
      durationDays,
      type: saveType
    });

    db.recordAutoSaveEvent({
      eventId: `as_${crypto.randomUUID().slice(0, 8)}`,
      userId: telegramId,
      invoiceId,
      amount: saveAmount,
      currency,
      savingsLockId: lock.lockId
    });

    return lock;
  }

  formatLockSummary(lock) {
    const unlockDate = new Date(lock.unlock_at).toLocaleDateString();
    const typeLabel = lock.type === 'yield' ? 'Yield Savings' : 'Locked Savings';
    const apyLine =
      lock.type === 'yield' && lock.user_apy
        ? `\n• APY shown to you: ${lock.user_apy.toFixed(2)}%`
        : '\n• Interest: None (lock only)';

    return (
      `🔒 ${typeLabel}\n` +
      `• ID: ${lock.lock_id}\n` +
      `• Amount: ${lock.amount} ${lock.currency}\n` +
      `• Unlocks: ${unlockDate}` +
      apyLine
    );
  }
}

module.exports = new SavingsService();
