require('dotenv').config();
const db = require('../src/db');
let TelegramBot = require('node-telegram-bot-api');
if (TelegramBot && TelegramBot.default) TelegramBot = TelegramBot.default;

async function pushNotifications() {
  console.log('🚀 Pushing KYC/Sync notifications to all existing Telegram users...');
  
  const token = process.env.TELEGRAM_BOT_TOKEN;
  let bot = null;
  if (token) {
    bot = new TelegramBot(token, { polling: false });
  } else {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN not configured. Pushing in-app notification records only.');
  }

  // Get all existing users on Telegram who need KYC or Sync
  const users = db.db.prepare(`
    SELECT * FROM users
    WHERE telegram_id IS NOT NULL AND telegram_id NOT LIKE 'did:ethr:%'
  `).all();

  console.log(`Found ${users.length} existing Telegram user(s) in database.`);

  let inAppCount = 0;
  let telegramMsgCount = 0;

  for (const u of users) {
    const targetId = u.telegram_id || u.user_id;

    // 1. Create In-App Notification entry in SQLite
    try {
      db.createNotification(
        targetId,
        'kyc_sync_reminder',
        '🔔 Identity Verification & Account Sync Required',
        'To unlock unlimited P2P transfers, bank cashouts, and multi-currency business features, please complete your identity verification or sync your PayIT Mobile App.',
        { action: 'profile_sync' }
      );
      inAppCount++;
    } catch (err) {
      console.warn(`Failed to create in-app notification for ${targetId}:`, err.message);
    }

    // 2. Send Telegram in-chat notification message if bot token available
    if (bot && u.telegram_id && /^\d+$/.test(u.telegram_id)) {
      try {
        const messageText = 
          `🔔 **Action Required: Complete Identity Verification & Sync App**\n\n` +
          `Hello ${u.first_name || 'there'}! 👋\n\n` +
          `To ensure uninterrupted service, higher transaction limits, and seamless bank cashouts on PayIT, please complete your identity verification or sync your Telegram account with your PayIT Mobile App.\n\n` +
          `👇 Tap below to get started:`;

        await bot.sendMessage(u.telegram_id, messageText, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔗 Sync Mobile App', callback_data: 'cmd_sync' }
              ]
            ]
          }
        });
        telegramMsgCount++;
        console.log(`✅ Pushed Telegram message to chat ${u.telegram_id}`);
      } catch (err) {
        console.warn(`⚠️ Could not send Telegram message to ${u.telegram_id}: ${err.message}`);
      }
    }
  }

  console.log(`\n🎉 Done! Created ${inAppCount} in-app notification records and sent ${telegramMsgCount} Telegram in-chat notifications.`);
  process.exit(0);
}

pushNotifications().catch(err => {
  console.error('❌ Notification push error:', err);
  process.exit(1);
});
