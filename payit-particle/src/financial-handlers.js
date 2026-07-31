const db = require('./db');
const dbPg = require('./db-pg');
const savingsService = require('./savings-service');
const payrollService = require('./payroll-service');
const yieldService = require('./yield-service');
const feeWallet = require('./fee-wallet');
const { formatInvoiceAmount } = require('./invoice-renderer');

async function getWelcomeMessage() {
  return (
    `Welcome to PayIT!\n\n` +
    `PayIT is your all-in-one money app for Africa — personal spending, business operations, savings, and payroll in one Telegram chat.\n\n` +
    `What you get after authentication:\n` +
    `• Two wallets — Personal and Business\n` +
    `• Send money in USDC, EURC, or NGN\n` +
    `• Create professional invoice images with exact payment details\n` +
    `• Savings — lock funds (no interest) or earn yield (up to 10% APY shown)\n` +
    `• Business auto-save — automatically save a % of every paid invoice\n` +
    `• Pay staff in bulk via text, voice note, or salary file upload\n` +
    `• Cash out to Nigerian bank accounts\n\n` +
    `How to use PayIT:\n` +
    `• Tap menu buttons or type naturally — "Send 5000 NGN to Ada"\n` +
    `• Send a voice note — "Save 200 USDC for 3 months with yield"\n` +
    `• Upload a CSV salary sheet for payroll\n` +
    `• Open Settings to view wallets and manage your business profile\n\n` +
    `Security:\n` +
    `• Social login — no complicated passwords\n` +
    `• Lock your account anytime from the menu\n` +
    `• Bank-level security on every transaction\n\n` +
    `Tap Authenticate below to create your wallets and get started.`
  );
}

async function getSavingsMenuReply(user) {
  const context = user.active_context === 'business' ? 'Business' : 'Personal';
  const autoSaveLine =
    user.auto_save_percent > 0
      ? `\n• Auto-Save active: ${user.auto_save_percent}% of paid invoices (${user.auto_save_type || 'lock'})`
      : '';

  return {
    reply:
      `🐷 Savings (${context})\n\n` +
      `1. Lock Savings — lock funds for a set period (no interest)\n` +
      `2. Yield Savings — lock funds and earn up to 10% APY\n` +
      `3. View My Savings — see active savings locks\n` +
      (user.active_context === 'business'
        ? `4. Auto-Save Setup — save a % of every paid invoice\n`
        : '') +
      autoSaveLine +
      `\nTip: type or send a voice note like:\n"Save 500 USDC for 90 days with yield"`
  };
}

async function parseDurationInput(text) {
  const clean = String(text || '').toLowerCase().trim();
  const match = clean.match(/(\d+)\s*(day|days|week|weeks|month|months|year|years)/);
  if (!match) {
    return null;
  }
  let days = parseInt(match[1], 10);
  const unit = match[2];
  if (unit.startsWith('week')) days *= 7;
  if (unit.startsWith('month')) days *= 30;
  if (unit.startsWith('year')) days *= 365;
  return days;
}

async function finalizeSavingsLock(telegramId, session, user) {
  const draft = session.tempSavings;
  const walletContext = user.active_context === 'business' ? 'business' : 'personal';
  const lock = await savingsService.createLock({
    telegramId,
    walletContext,
    amount: draft.amount,
    currency: draft.currency || 'USDC',
    durationDays: draft.durationDays,
    type: draft.type || 'lock'
  });

  session.state = 'IDLE';
  session.tempSavings = { type: null, amount: null, currency: 'USDC', durationDays: null };

  const unlockDate = new Date(lock.unlockAt).toLocaleDateString();
  const amountLabel = formatInvoiceAmount(lock.amount, lock.currency);
  let reply =
    `✅ Savings Created!\n\n` +
    `• Type: ${lock.type === 'yield' ? 'Yield Savings' : 'Lock Savings'}\n` +
    `• Amount: ${amountLabel}\n` +
    `• Duration: ${lock.durationDays} days\n` +
    `• Unlocks: ${unlockDate}\n` +
    `• Lock ID: ${lock.lockId}`;

  if (lock.type === 'yield') {
    reply +=
      `\n• APY shown to you: ${lock.userApy.toFixed(2)}%` +
      `\n• Vault: ${lock.yieldPool ? `${lock.yieldPool.project} (${lock.yieldPool.chain})` : 'Best available stablecoin pool'}`;
    if (lock.platformApy > 0) {
      reply += `\n\nYield is secured at market rates. You earn up to 10% APY on this lock.`;
    }
  } else {
    reply += `\n\nFunds are locked with no interest until the unlock date.`;
  }

  return { reply };
}

async function handleFinancialIntent(telegramId, parsed, session, user) {
  if (!parsed || !parsed.action) {
    return null;
  }

  if (parsed.action === 'SAVINGS_MENU') {
    return getSavingsMenuReply(user);
  }

  if (parsed.action === 'SET_AUTOSAVE') {
    if (user.active_context !== 'business') {
      return { reply: 'Auto-save is a business feature. Switch to your business profile first.' };
    }
    const percent = parsed.parameters.autoSavePercent;
    if (!percent || percent <= 0 || percent > 100) {
      session.state = 'AWAITING_AUTOSAVE_PERCENT';
      return { reply: 'Enter the percentage to auto-save from each paid invoice (e.g. 15):' };
    }
    await dbPg.updateAutoSaveSettings(
      telegramId,
      percent,
      parsed.parameters.saveType || 'lock',
      parsed.parameters.durationDays || 30
    );
    return {
      reply:
        `✅ Auto-Save Enabled!\n\n` +
        `• ${percent}% of every paid invoice will be saved automatically\n` +
        `• Savings type: ${parsed.parameters.saveType || 'lock'}\n` +
        `• Lock duration: ${parsed.parameters.durationDays || 30} days`
    };
  }

  if (parsed.action === 'SAVINGS_LOCK' || parsed.action === 'SAVINGS_YIELD') {
    const params = parsed.parameters || {};
    const saveType = parsed.action === 'SAVINGS_YIELD' ? 'yield' : 'lock';
    session.tempSavings.type = saveType;

    if (params.amount && params.durationDays) {
      session.tempSavings.amount = params.amount;
      session.tempSavings.currency = params.currency || 'USDC';
      session.tempSavings.durationDays = params.durationDays;
      return finalizeSavingsLock(telegramId, session, user);
    }

    if (params.amount) {
      session.tempSavings.amount = params.amount;
      session.tempSavings.currency = params.currency || 'USDC';
      session.state = 'AWAITING_SAVE_DURATION';
      return {
        reply: `✅ Amount: ${formatInvoiceAmount(params.amount, params.currency || 'USDC')}\n\nHow long should funds stay locked? (e.g. 30 days, 3 months, 1 year)`
      };
    }

    session.state = 'AWAITING_SAVE_AMOUNT';
    return {
      reply:
        `${saveType === 'yield' ? '📈 Yield Savings' : '🔒 Lock Savings'}\n\n` +
        `Enter the amount to save (e.g. 500 USDC):`
    };
  }

  if (parsed.action === 'BULK_PAYROLL') {
    if (user.active_context !== 'business') {
      return { reply: 'Payroll is a business feature. Switch to your business profile first.' };
    }

    const recipients = parsed.parameters.recipients;
    if (Array.isArray(recipients) && recipients.length > 0) {
      const batch = payrollService.createBatch({
        telegramId,
        recipients,
        currency: parsed.parameters.currency || 'USDC',
        paymentMethod: recipients[0].paymentMethod || 'stablecoin'
      });
      session.pendingAction = { type: 'payroll', batchId: batch.batchId };
      session.state = 'AWAITING_PAYROLL_CONFIRM';
      return { reply: payrollService.formatBatchPreview(batch.batchId) };
    }

    session.state = 'AWAITING_PAYROLL_DATA';
    session.pendingAction = { type: 'payroll', batchId: null };
    return {
      reply:
        `👥 Business Payroll\n\n` +
        `Send staff payments in stablecoins or NGN.\n\n` +
        `Option A — type bulk payment:\n` +
        `"Pay staff Ada 500 USDC, John 300 USDC"\n\n` +
        `Option B — upload a CSV/TXT salary file with columns:\n` +
        `Name, Amount, Currency, WalletOrAccount`
    };
  }

  return null;
}

module.exports = {
  getWelcomeMessage,
  getSavingsMenuReply,
  parseDurationInput,
  finalizeSavingsLock,
  handleFinancialIntent
};
