require('dotenv').config();
const db = require('../src/db');
let TelegramBot = require('node-telegram-bot-api');
if (TelegramBot && TelegramBot.default) TelegramBot = TelegramBot.default;

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('No TELEGRAM_BOT_TOKEN configured');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log('🤖 Listening for messages on @payiitbot...');
console.log('👉 Please send ANY message to @payiitbot in your Telegram app right now!');

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name || 'User';
  console.log(`\n📩 Received message from @${username} (Chat ID: ${chatId}): "${msg.text}"`);

  // Ensure user is in database
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
    db.db.prepare('UPDATE users SET first_name = ? WHERE telegram_id = ?').run(username, chatId.toString());
    console.log(`✅ Created DB user record for Chat ID ${chatId}`);
  }

  // Send the notification directly
  const messageText = 
    `🔔 **Action Required: Complete Identity Verification & Sync App**\n\n` +
    `Hello @${username}! 👋\n\n` +
    `To ensure uninterrupted service, higher transaction limits, and seamless bank cashouts on PayIT, please complete your identity verification or sync your Telegram account with your PayIT Mobile App.\n\n` +
    `👇 Tap below to get started:`;

  try {
    await bot.sendMessage(chatId, messageText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔗 Sync Mobile App', callback_data: 'cmd_sync' }]
        ]
      }
    });
    console.log(`🎉 Notification successfully delivered to @${username} (Chat ID: ${chatId})!`);
  } catch (err) {
    console.error(`❌ Failed to send message: ${err.message}`);
  }
});
