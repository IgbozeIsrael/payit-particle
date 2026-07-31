#!/usr/bin/env node
require('dotenv').config();
const db = require('./src/db');
const nuvionService = require('./src/nuvion-service');

async function test() {
  console.log('\n' + '='.repeat(80));
  console.log('✅ Testing Business Account Balance Sync (FIXED)');
  console.log('='.repeat(80) + '\n');

  try {
    const user = db.db.prepare(`
      SELECT * FROM users WHERE telegram_id IS NOT NULL LIMIT 1
    `).get();

    if (!user) {
      console.error('❌ User not found');
      process.exit(1);
    }

    const USER_ID = user.telegram_id;
    console.log(`Testing user: ${USER_ID}\n`);

    // Test business account balance
    console.log('Testing Business Account Sync...\n');
    const businessRes = await nuvionService.syncNuvionLiveAccountBalance(USER_ID, 'business');

    console.log('Result:');
    console.log(`  ✅ Live NGN: ₦${businessRes.liveNgn}`);
    console.log(`  ✅ USDT Equivalent: $${businessRes.usdtAmount}`);
    console.log(`  ✅ Account Number: ${businessRes.accountNumber}`);
    console.log(`  ✅ Synced: ${businessRes.synced}\n`);

    // Expected: ₦0 or actual balance in NGN
    if (businessRes.liveNgn >= 0) {
      console.log(`✅ Business balance synced: ₦${businessRes.liveNgn}`);
    } else {
      console.log(`❌ Error syncing business balance`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

test();
