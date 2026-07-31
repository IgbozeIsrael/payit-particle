/**
 * notification-service.js
 * Dispatches invoice-paid and other notifications via:
 *  1. Telegram Bot push (if user has telegram_id or it is a DID mapped to one)
 *  2. In-app notifications DB table (polled by mobile app)
 */
const db = require('./db');
const dbPg = require('./db-pg');
require('dotenv').config();

// Lazy-load telegram bot to avoid circular dependencies
let _bot = null;
async function getBot() {
  if (!_bot) {
    try {
      let TelegramBot = require('node-telegram-bot-api');
      if (TelegramBot && TelegramBot.default) TelegramBot = TelegramBot.default;
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (token) {
        // Use request-only mode (no polling) so we don't conflict with the running bot
        _bot = new TelegramBot(token, { polling: false });
      }
    } catch (err) {
      console.warn('[Notifications] Telegram bot load failed:', err?.message || err);
    }
  }
  return _bot;
}

/**
 * Send a Telegram message to a user if they have a numeric Telegram ID.
 * DID-based users (Magic.link) won't have a numeric telegram_id so we skip gracefully.
 */
async function sendTelegramPush(userId, text) {
  const bot = getBot();
  if (!bot) return;
  // Only send if userId looks like a numeric Telegram chat ID
  const numericId = parseInt(userId, 10);
  if (!isNaN(numericId) && numericId > 0) {
    try {
      await bot.sendMessage(numericId, text, { parse_mode: 'HTML' });
      console.log(`[Notifications] Telegram push sent to ${numericId}`);
    } catch (err) {
      console.warn(`[Notifications] Telegram push failed for ${numericId}: ${err.message}`);
    }
  }
}

module.exports = {
  /**
   * Notify user that their invoice was paid.
   */
  async notifyInvoicePaid(userId, invoice, paidAmount) {
    const invoiceId = invoice.invoice_id || invoice.invoiceId;
    const clientName = invoice.client_name || invoice.recipient || 'Client';
    const currency = invoice.currency || 'NGN';
    const amountDisplay = currency === 'NGN'
      ? `₦${Number(paidAmount || invoice.amount).toLocaleString()}`
      : `$${Number(paidAmount || invoice.amount).toFixed(2)} ${currency}`;

    const title = '💰 Invoice Paid!';
    const body = `${amountDisplay} received for invoice ${invoiceId} from ${clientName}.`;

    // 1. Save in-app notification
    await dbPg.createNotification(userId, 'invoice_paid', title, body, {
      invoiceId,
      amount: paidAmount || invoice.amount,
      currency,
      clientName,
    });

    // 2. Push to Telegram if applicable
    const telegramText = `✅ <b>Invoice Paid!</b>\n\n${amountDisplay} has been received for invoice <b>${invoiceId}</b> from <b>${clientName}</b>.\n\nYour PayIT wallet has been credited. 🎉`;
    await sendTelegramPush(userId, telegramText);

    console.log(`[Notifications] Invoice paid notification dispatched for user ${userId} — ${invoiceId}`);
  },

  /**
   * Notify user of a new deposit to their account.
   */
  async notifyDeposit(userId, amount, currency, source) {
    const amountDisplay = currency === 'NGN'
      ? `₦${Number(amount).toLocaleString()}`
      : `$${Number(amount).toFixed(2)} ${currency}`;

    const title = '💸 Funds Received';
    const body = `${amountDisplay} deposited to your PayIT wallet${source ? ` from ${source}` : ''}.`;

    await dbPg.createNotification(userId, 'deposit', title, body, { amount, currency, source });

    const telegramText = `💸 <b>Funds Received!</b>\n\n${amountDisplay} has been deposited to your PayIT wallet.\n\nYour balance has been updated.`;
    await sendTelegramPush(userId, telegramText);
  },

  /**
   * Notify user of a successful transfer.
   */
  async notifyTransferSent(userId, amount, currency, recipient) {
    const amountDisplay = currency === 'NGN'
      ? `₦${Number(amount).toLocaleString()}`
      : `$${Number(amount).toFixed(2)} ${currency}`;

    const title = '✈️ Transfer Sent';
    const body = `${amountDisplay} sent to ${recipient}.`;

    await dbPg.createNotification(userId, 'transfer_sent', title, body, { amount, currency, recipient });
  },

  /**
   * Notify user that savings lock was created.
   */
  async notifySavingsCreated(userId, amountNgn, durationDays, apy) {
    const title = '🐷 Savings Started';
    const body = `₦${Number(amountNgn).toLocaleString()} locked for ${durationDays} days at ~${apy}% p.a. in PayIT Money Market.`;
    await dbPg.createNotification(userId, 'savings_created', title, body, { amountNgn, durationDays, apy });
  },

  /**
   * Generic notification dispatcher.
   * @param {string} userId - User ID
   * @param {string} type - Notification type
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {object} [data] - Additional data
   */
  async notify(userId, type, title, body, data = {}) {
    try {
      await dbPg.createNotification(userId, type, title, body, data);
    } catch (err) {
      console.warn(`[Notifications] Failed to create in-app notification for ${userId}: ${err.message}`);
    }
    // Also send Telegram push if applicable
    await sendTelegramPush(userId, `🔔 <b>${title}</b>\n\n${body}`);
  },
};
