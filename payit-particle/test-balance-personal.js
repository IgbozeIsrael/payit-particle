#!/usr/bin/env node
require('dotenv').config();
const db = require('./src/db');
const nuvionService = require('./src/nuvion-service');

async function test() {
  console.log('\n' + '='.repeat(80));
  console.log('✅ Testing Personal Account Balance Sync (FIXED)');
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

    // Test personal account balance
    console.log('Testing Personal Account Sync...\n');
    const personalRes = await nuvionService.syncNuvionLiveAccountBalance(USER_ID, 'personal');

    console.log('Result:');
    console.log(`  ✅ Live NGN: ₦${personalRes.liveNgn}`);
    console.log(`  ✅ USDT Equivalent: $${personalRes.usdtAmount}`);
    console.log(`  ✅ Account Number: ${personalRes.accountNumber}`);
    console.log(`  ✅ Synced: ${personalRes.synced}\n`);

    // Expected: ₦50 (after converting 5000 kobo)
    if (personalRes.liveNgn === 50) {
      console.log('✅ CORRECT! Personal balance is ₦50');
    } else {
      console.log(`⚠️  Got ₦${personalRes.liveNgn} (expected ₦50)`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

test();
