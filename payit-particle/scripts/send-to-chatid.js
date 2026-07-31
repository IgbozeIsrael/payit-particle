require('dotenv').config();
const db = require('../src/db');
let TelegramBot = require('node-telegram-bot-api');
if (TelegramBot && TelegramBot.default) TelegramBot = TelegramBot.default;

const chatId = process.argv[2];
if (!chatId) {
  console.error('Usage: node scripts/send-to-chatid.js <CHAT_ID>');
  process.exit(1);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('No TELEGRAM_BOT_TOKEN found in .env');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: false });

async function sendNotification() {
  console.log(`🚀 Sending live notification directly to Telegram Chat ID ${chatId}...`);

  // Ensure record exists in SQLite database
  const existing = db.getUser(chatId.toString());
  if (!existing) {
    const walletManager = require('../src/wallet');
    const { ethers } = require('ethers');
    const masterWallet = walletManager.getMasterWallet();
    const ownerAddress = masterWallet.particleManaged ? ethers.Wallet.createRandom().address : masterWallet.address;
    const personalSmartAccount = walletManager.deriveSmartAccountAddress(ownerAddress, 0);
    const businessSmartAccount = walletManager.deriveSmartAccountAddress(ownerAddress, 1);
    db.createUser(chatId.toString(), personalSmartAccount, businessSmartAccount, 'telegram');
    db.updateOwnerAddress(chatId.toString(), ownerAddress);
    db.db.prepare('UPDATE users SET first_name = ? WHERE telegram_id = ?').run('Israel Igboze', chatId.toString());
    console.log(`✅ Created DB user record for Chat ID ${chatId}`);
  }

  // Create in-app notification row in database
  db.createNotification(
    chatId.toString(),
    'kyc_sync_reminder',
    '🔔 Identity Verification & Account Sync Required',
    'To unlock unlimited P2P transfers, bank cashouts, and multi-currency business features, please complete your identity verification or sync your PayIT Mobile App.',
    { action: 'profile_sync' }
  );

  // Send Telegram message directly
  const messageText = 
    `🔔 **Action Required: Complete Identity Verification & Sync App**\n\n` +
    `Hello! 👋\n\n` +
    `To ensure uninterrupted service, higher transaction limits, and seamless bank cashouts on PayIT, please complete your identity verification or sync your Telegram account with your PayIT Mobile App.\n\n` +
    `👇 Tap below to get started:`;

  try {
    const res = await bot.sendMessage(chatId, messageText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔗 Sync Mobile App', callback_data: 'cmd_sync' }]
        ]
      }
    });
    console.log(`🎉 Notification successfully delivered! Message ID: ${res.message_id}`);
  } catch (err) {
    console.error(`❌ Delivery failed: ${err.message}`);
  }
}

sendNotification().catch(err => {
  console.error('Error:', err);
});
