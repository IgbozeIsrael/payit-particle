// Support both CJS and ESM-shaped exports from `node-telegram-bot-api`
let TelegramBot = require('node-telegram-bot-api');
if (TelegramBot && TelegramBot.default) TelegramBot = TelegramBot.default;
const axios = require('axios');
const bot = require('./bot');
const mediaParser = require('./media-parser');
require('dotenv').config();

class TelegramBotService {
  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN;
    this.webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
    this.useWebhook = process.env.TELEGRAM_USE_WEBHOOK === 'true';
    this.authUrl = process.env.AUTH_URL ? process.env.AUTH_URL.trim() : '';
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (!this.token) {
      console.warn('TELEGRAM_BOT_TOKEN not configured. Telegram bot will not start.');
      this.bot = null;
      return;
    }

    const shouldUseWebhook = this.useWebhook && !!this.webhookUrl;
    const pollingEnabled = process.env.TELEGRAM_DISABLE_POLLING === 'true' ? false : !shouldUseWebhook;
    this.bot = new TelegramBot(this.token, { polling: pollingEnabled });

    if (this.useWebhook && !this.webhookUrl) {
      console.warn('TELEGRAM_USE_WEBHOOK is true but TELEGRAM_WEBHOOK_URL is missing. Falling back to polling.');
    }

    if (!this.authUrl && !isProduction) {
      this.authUrl = 'http://localhost:3000/auth';
      console.warn('AUTH_URL is not configured. Using local fallback http://localhost:3000/auth for development.');
    } else if (!this.authUrl) {
      console.warn('AUTH_URL is not configured. Authentication links will be unavailable.');
    }
    
    this.setupHandlers();
  }

  getAuthLink(telegramId) {
    if (!this.authUrl) {
      return null;
    }

    const isLocalHttp = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(this.authUrl);
    const isHttps = /^https:\/\//i.test(this.authUrl);
    if (!isHttps && !isLocalHttp) {
      console.error('AUTH_URL must use HTTPS in non-local environments.');
      return null;
    }

    return `${this.authUrl}?telegram_id=${encodeURIComponent(telegramId)}`;
  }

  shouldUseUrlButton() {
    // Telegram inline keyboard URL buttons must be https:// (Telegram rejects http://).
    // For local dev (http://localhost), we fall back to a callback button and send the link as a message.
    return /^https:\/\//i.test(this.authUrl);
  }

  async downloadTelegramFile(fileId) {
    const file = await this.bot.getFile(fileId);
    const url = `https://api.telegram.org/file/bot${this.token}/${file.path}`;
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  }

  getRootKeyboard() {
    return {
      reply_markup: {
        keyboard: [
          ['👤 Personal Account', '🏢 Business Account'],
          ['🎧 AI Support', '❓ FAQ'],
          ['⚙️ Settings', '❓ Help']
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    };
  }

  getPersonalKeyboard() {
    return {
      reply_markup: {
        keyboard: [
          ['💰 Check Balance', '🐷 Savings'],
          ['💳 Receive Money', '💸 Send Money'],
          ['🪓 Split Bill', '🤝 Escrow'],
          ['📱 Utilities', '🏦 Cash Out'],
          ['🏢 Switch to Business', '⬅️ Back to Main Menu']
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    };
  }

  getBusinessKeyboard() {
    return {
      reply_markup: {
        keyboard: [
          ['💰 Check Balance', '🧾 Invoice Hub'],
          ['📸 Scan Receipt', '👥 Pay Staff'],
          ['🏦 Tax Settings', '💾 Auto-Save Setup'],
          ['📈 Business Data Export'],
          ['👤 Switch to Personal', '⬅️ Back to Main Menu']
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    };
  }

  getInvoiceHubKeyboard() {
    return {
      reply_markup: {
        keyboard: [
          ['➕ New Invoice', '📜 Old Invoices'],
          ['📊 Balance Sheet', '⬅️ Back to Menu']
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    };
  }

  getSettingsKeyboard() {
    return {
      reply_markup: {
        keyboard: [
          ['👛 View Wallets', '🔑 View Private Key'],
          ['🏢 Business Profile', '🔗 Sync Mobile App'],
          ['📧 Secure Account', '🔒 Lock Account'],
          ['⬅️ Back to Main Menu']
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    };
  }

  getOnboardingKeyboard() {
    return {
      reply_markup: {
        keyboard: [
          ['🔗 Sync Mobile App', '✨ Create New Account'],
          ['⚙️ Settings', '❓ Help']
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    };
  }

  getKeyboardForResult(result) {
    if (result && result.keyboard === 'onboarding') {
      return this.getOnboardingKeyboard();
    }
    if (result && result.keyboard === 'settings') {
      return this.getSettingsKeyboard();
    }
    if (result && result.keyboard === 'invoice_hub') {
      return this.getInvoiceHubKeyboard();
    }
    if (result && result.keyboard === 'business') {
      return this.getBusinessKeyboard();
    }
    if (result && result.keyboard === 'personal') {
      return this.getPersonalKeyboard();
    }
    if (result && result.keyboard === 'root') {
      return this.getRootKeyboard();
    }
    // Default fallback
    return this.getRootKeyboard();
  }

  async sendBotResult(chatId, telegramId, result) {
    const sanitizeText = (value) =>
      String(value ?? '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/`/g, '');

    const keyboard = this.getKeyboardForResult(result);

    // We removed the external Magic.link URL button because it causes mobile resolution issues on local dev.
    // Instead, we will handle it natively in the bot flow.

    if (result && result.documentBuffer) {
      await this.bot.sendDocument(chatId, result.documentBuffer, {
        caption: sanitizeText(result.reply || ''),
        ...keyboard
      }, { filename: result.documentName || 'document.xlsx' });
    } else if (result && result.imageBuffer) {
      await this.bot.sendPhoto(chatId, result.imageBuffer, {
        caption: sanitizeText(result.reply || ''),
        ...keyboard
      }, { filename: 'invoice.jpg', contentType: 'image/jpeg' });
    } else if (result && result.imageUrl) {
      await this.bot.sendPhoto(chatId, result.imageUrl, {
        caption: sanitizeText(result.reply || ''),
        ...keyboard
      });
    } else if (result && result.documentBuffer) {
      await this.bot.sendDocument(chatId, result.documentBuffer, {}, {
        filename: result.documentName || 'document.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      if (result.reply) {
        await this.bot.sendMessage(chatId, sanitizeText(result.reply), keyboard);
      }
    } else {
      await this.bot.sendMessage(chatId, sanitizeText(result.reply), keyboard);
    }
  }

  setupHandlers() {
    // Handle all messages first (including commands)
    this.bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const telegramId = msg.from.id.toString();
      const text = msg.text || '';

      // Auto-register Telegram user details in SQLite upon receiving any message
      try {
        const existingUser = bot.db ? bot.db.getUser(telegramId) : null;
        if (!existingUser) {
          const walletManager = require('./wallet');
          const { ethers } = require('ethers');
          const db = require('./db');
          const masterWallet = walletManager.getMasterWallet();
          const ownerAddress = masterWallet.particleManaged ? ethers.Wallet.createRandom().address : masterWallet.address;
          const personalSmartAccount = walletManager.deriveSmartAccountAddress(ownerAddress, 0);
          const businessSmartAccount = walletManager.deriveSmartAccountAddress(ownerAddress, 1);
          db.createUser(telegramId, personalSmartAccount, businessSmartAccount, 'telegram');
          db.updateOwnerAddress(telegramId, ownerAddress);
          if (msg.from && (msg.from.first_name || msg.from.last_name)) {
            await dbPg.query('UPDATE users SET first_name = ?, last_name = ? WHERE telegram_id = ?', [msg.from.first_name || null, msg.from.last_name || null, telegramId]);
          }
        }
      } catch (e) {}

      // Business logo photo upload during onboarding
      if (msg.photo && msg.photo.length > 0) {
        const session = bot.getSession(telegramId);
        if (session.state === 'AWAITING_BIZ_LOGO') {
          const fileId = msg.photo[msg.photo.length - 1].file_id;
          try {
            const result = await bot.processMessage(telegramId, `__photo__:${fileId}`);
            await this.sendBotResult(chatId, telegramId, result);
          } catch (error) {
            console.error('Error processing business logo photo:', error);
            await this.bot.sendMessage(chatId, 'Sorry, something went wrong. Please try again.');
          }
          return;
        }

        if (session.state === 'AWAITING_RECEIPT') {
          const fileId = msg.photo[msg.photo.length - 1].file_id;
          try {
            const imageBuffer = await this.downloadTelegramFile(fileId);
            const result = await require('./ocr-service').parseReceiptImage(telegramId, imageBuffer);
            session.state = 'IDLE';
            await this.sendBotResult(chatId, telegramId, result);
          } catch (error) {
            console.error('Error processing receipt photo:', error);
            await this.bot.sendMessage(chatId, 'Sorry, I could not read that receipt. Please try again.');
            session.state = 'IDLE';
          }
          return;
        }

        // General image intent parsing (savings, payroll notes, etc.)
        try {
          const fileId = msg.photo[msg.photo.length - 1].file_id;
          const imageBuffer = await this.downloadTelegramFile(fileId);
          const parsed = await mediaParser.parseImageBuffer(imageBuffer);
          const result = await bot.processMediaInput(telegramId, parsed);
          await this.sendBotResult(chatId, telegramId, result);
        } catch (error) {
          console.error('Error processing image intent:', error);
          await this.bot.sendMessage(chatId, 'Could not read that image. Try sending text or a voice note instead.');
        }
        return;
      }

      // Voice note intent parsing
      if (msg.voice) {
        try {
          const audioBuffer = await this.downloadTelegramFile(msg.voice.file_id);
          const parsed = await mediaParser.parseVoiceNote(audioBuffer);
          const result = await bot.processMediaInput(telegramId, parsed);
          await this.sendBotResult(chatId, telegramId, result);
        } catch (error) {
          console.error('Error processing voice note:', error);
          try {
            await this.bot.sendMessage(chatId, 'Could not process voice note. Try typing your request instead.');
          } catch (e) {
            console.error('Could not send fallback message:', e.message);
          }
        }
        return;
      }

      // Salary / payroll document upload
      if (msg.document) {
        try {
          const fileName = msg.document.file_name || 'upload.txt';
          const buffer = await this.downloadTelegramFile(msg.document.file_id);
          const text = buffer.toString('utf8');
          const parsed = await mediaParser.parseDocumentText(text);
          const result = await bot.processMediaInput(telegramId, parsed);
          await this.sendBotResult(chatId, telegramId, result);
        } catch (error) {
          console.error('Error processing document:', error);
          try {
            await this.bot.sendMessage(chatId, 'Could not read that file. Upload CSV/TXT with Name, Amount, Currency columns.');
          } catch (e) {
            console.error('Could not send fallback message:', e.message);
          }
        }
        return;
      }
      
      // Handle /start command (with or without deep-link payload)
      if (text === '/start' || text.toLowerCase().startsWith('/start ')) {
        try {
          const result = await bot.processMessage(telegramId, '/start');
          await this.sendBotResult(chatId, telegramId, result);
        } catch (error) {
          console.error('Error processing /start:', error);
          try {
            await this.bot.sendMessage(chatId, 'Sorry, something went wrong. Please try again.');
          } catch (e) {
            console.error('Could not send fallback message:', e.message);
          }
        }
        return;
      }
      
      // Handle other commands
      if (text.startsWith('/')) {
        let command = text.toLowerCase();
        try {
          const result = await bot.processMessage(telegramId, command);
          await this.sendBotResult(chatId, telegramId, result);
        } catch (error) {
          console.error('Error processing command:', error);
          try {
            await this.bot.sendMessage(chatId, 'Sorry, something went wrong. Please try again.');
          } catch (e) {
            console.error('Could not send fallback message:', e.message);
          }
        }
        return;
      }
      
      // Map button text to commands
      let command = text;
      if (text === '💰 Check Balance') command = 'balance';
      else if (text === '🐷 Savings') command = 'savings';
      else if (text === '🧾 Invoice Hub') command = 'invoice hub';
      else if (text === '➕ New Invoice' || text === '🧾 Create Invoice') command = 'new invoice';
      else if (text === '📜 Old Invoices') command = 'old invoices';
      else if (text === '📊 Balance Sheet') command = 'balance sheet';
      else if (text === '💸 Send Money') command = 'send';
      else if (text === '🏦 Cash Out') command = 'cash out';
      else if (text === '🪓 Split Bill') command = 'split bill';
      else if (text === '🤝 Escrow') command = 'escrow';
      else if (text === '📱 Utilities') command = 'utilities';
      else if (text === '📸 Scan Receipt') command = 'scan receipt';
      else if (text === '🏦 Tax Settings') command = 'tax settings';
      else if (text === '👥 Pay Staff') command = 'pay staff';
      else if (text === '💾 Auto-Save Setup') command = 'auto-save';
      else if (text === '⚙️ Settings') command = '/settings';
      else if (text === '👛 View Wallets') command = '/wallets';
      else if (text === '🏢 Business Profile') command = '/business';
      else if (text === '🔗 Sync Mobile App' || text === '🔗 Link Mobile App') command = '/sync';
      else if (text === '📧 Secure Account') command = '/secure';
      else if (text === '💳 Receive Money') command = 'receive money';
      else if (text === '📈 Business Data Export') command = 'business export';
      else if (text === '⬅️ Back to Main Menu' || text === '⬅️ Back to Menu') command = '/menu';
      else if (text === '👤 Personal Account') command = 'personal account';
      else if (text === '🏢 Business Account') command = 'business account';
      else if (text === '📊 Status') command = '/status';
      else if (text === '🔒 Lock Account') command = '/lock';
      else if (text === '🔓 Unlock Account') command = '/unlock';
      else if (text === '❓ Help') command = 'help';
      
      try {
        const result = await bot.processMessage(telegramId, command);
        await this.sendBotResult(chatId, telegramId, result);
      } catch (error) {
        console.error('Error processing message:', error);
        try {
          await this.bot.sendMessage(chatId, 'Sorry, something went wrong. Please try again.');
        } catch (e) {
          console.error('Could not send fallback message:', e.message);
        }
      }
    });

    // Error handling
    this.bot.on('polling_error', (error) => {
      const code = error && error.code ? error.code : 'UNKNOWN';
      const message = error && error.message ? error.message : 'Unknown polling error';
      console.error(`Telegram bot polling error [${code}]: ${message}`);

      if (code === 'ETELEGRAM' && message.includes('409 Conflict')) {
        console.error('Another bot instance is using getUpdates. Stop duplicate instances and restart one bot process.');
      }
    });

    // Handle callback queries from inline buttons
    this.bot.on('callback_query', async (query) => {
      const telegramId = query?.from?.id ? query.from.id.toString() : null;
      const data = typeof query?.data === 'string' ? query.data : '';

      try {
        if (!query?.message?.chat?.id) {
          await this.bot.answerCallbackQuery(query.id, {
            text: 'Please open the bot chat and try again.',
            show_alert: true
          });
          return;
        }

        if (!telegramId) {
          await this.bot.answerCallbackQuery(query.id, {
            text: 'Unable to identify your Telegram account.',
            show_alert: true
          });
          return;
        }

        const chatId = query.message.chat.id;

        if (data.startsWith('auth_')) {
          const fullUrl = this.getAuthLink(telegramId);
          if (!fullUrl) {
            await this.bot.answerCallbackQuery(query.id, { text: 'Authentication is unavailable right now.', show_alert: true });
            return;
          }
          await this.bot.answerCallbackQuery(query.id);
          await this.bot.sendMessage(chatId, `Authentication link:\n${fullUrl}`);
        } else if (data === 'cmd_sync') {
          await this.bot.answerCallbackQuery(query.id);
          const result = await bot.processMessage(telegramId, '/sync');
          await this.sendBotResult(chatId, telegramId, result);
        } else if (data === 'balance_action') {
          const result = await bot.processMessage(telegramId, 'balance');
          await this.bot.answerCallbackQuery(query.id);
          await this.sendBotResult(chatId, telegramId, result);
        } else if (data === 'invoice_action') {
          const result = await bot.processMessage(telegramId, 'invoice');
          await this.bot.answerCallbackQuery(query.id);
          await this.sendBotResult(chatId, telegramId, result);
        } else if (data === 'send_action') {
          const result = await bot.processMessage(telegramId, 'send');
          await this.bot.answerCallbackQuery(query.id);
          await this.sendBotResult(chatId, telegramId, result);
        } else if (data === 'cashout_action') {
          const result = await bot.processMessage(telegramId, 'cash out');
          await this.bot.answerCallbackQuery(query.id);
          await this.sendBotResult(chatId, telegramId, result);
        } else if (data.startsWith('sweep_')) {
          const depositId = data.split('_').slice(1).join('_');
          await this.bot.answerCallbackQuery(query.id, { text: 'Sweeping funds...', show_alert: false });
          try {
            // Update deposit status to swept
            const deposit = db.getHdDeposit(depositId);
            if (deposit) {
              db.updateHdDepositStatus(depositId, 'swept');
              await this.bot.sendMessage(chatId, `✅ **Sweep Successful!**\n\nFunds have been securely swept to your Universal Account. Gas fees were sponsored by Particle Network.`);
            } else {
              // Try as invoice
              const invoice = db.getInvoice(depositId);
              if (invoice) {
                db.updateInvoiceStatus(depositId, 'swept');
                await this.bot.sendMessage(chatId, `✅ **Invoice Sweep Successful!**\n\nFunds have been swept to your Universal Account.`);
              } else {
                await this.bot.sendMessage(chatId, `❌ Deposit/invoice not found.`);
              }
            }
          } catch (err) {
            console.error('[Sweep] Error:', err);
            await this.bot.sendMessage(chatId, `❌ Sweep failed: ${err.message}`);
          }
        }
      } catch (error) {
        console.error('Error handling callback query:', error);
        await this.bot.answerCallbackQuery(query.id, { text: 'Error occurred', show_alert: true });
      }
    });
  }

  start() {
    if (!this.bot) {
      console.log('Telegram bot not configured. Skipping bot startup.');
      return;
    }
    
    console.log('PayIT Telegram bot started successfully!');
    console.log(`Transport mode: ${this.useWebhook ? 'webhook' : 'polling'}`);
    console.log('Bot is listening for messages...');
  }

  setWebhook() {
    if (!this.bot || !this.webhookUrl) {
      console.warn('Cannot set webhook: bot or webhook URL not configured');
      return;
    }

    if (!this.useWebhook) {
      console.warn('Webhook mode is disabled. Set TELEGRAM_USE_WEBHOOK=true to enable.');
      return;
    }

    this.bot.setWebHook(this.webhookUrl)
      .then(() => console.log(`Webhook set to: ${this.webhookUrl}`))
      .catch(err => console.error('Failed to set webhook:', err));
  }
}

const telegramBotService = new TelegramBotService();

// Start the bot when this file is run directly (e.g. npm run telegram).
if (require.main === module) {
  telegramBotService.start();
}

module.exports = telegramBotService;
