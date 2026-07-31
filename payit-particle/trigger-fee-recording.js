#!/usr/bin/env node
require('dotenv').config();
const db = require('./src/db');
const nuvionService = require('./src/nuvion-service');

async function test() {
  console.log('\n' + '='.repeat(80));
  console.log('🎯 Triggering Balance Sync to Record Micro-Fees');
  console.log('='.repeat(80) + '\n');

  try {
    // Get first user with telegram_id
    const user = db.db.prepare(`
      SELECT * FROM users WHERE telegram_id IS NOT NULL LIMIT 1
    `).get();

    if (!user) {
      console.error('❌ User not found');
      process.exit(1);
    }

    const USER_ID = user.telegram_id;
    console.log(`📱 Using user: ${USER_ID}`);
    console.log(`📧 Email: ${user.business_email || user.personal_email || 'N/A'}\n`);

    // Trigger balance sync for personal account
    console.log('📊 Syncing personal account balance...\n');
    const syncResult = await nuvionService.syncNuvionLiveAccountBalance(USER_ID, 'personal');

    console.log('✅ Sync Result:');
    console.log(`   Live NGN: ₦${syncResult.liveNgn}`);
    console.log(`   USDT Equivalent: $${syncResult.usdtAmount}`);
    console.log(`   Account Number: ${syncResult.accountNumber}`);
    console.log(`   Synced: ${syncResult.synced}\n`);

    // Wait 2 seconds
    console.log('⏳ Waiting 2 seconds for fee recording...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Query platform_fees table
    console.log('\n' + '='.repeat(80));
    console.log('📋 Recent Platform Fees (Last 5)');
    console.log('='.repeat(80) + '\n');

    const fees = db.db.prepare(`
      SELECT 
        fee_id, 
        user_id, 
        amount_usdt, 
        status, 
        created_at 
      FROM platform_fees 
      ORDER BY created_at DESC 
      LIMIT 5
    `).all();

    if (fees.length === 0) {
      console.log('❌ No fees found in database');
    } else {
      console.log('Fee Records:');
      fees.forEach((fee, idx) => {
        console.log(`\n  ${idx + 1}. ID: ${fee.fee_id}`);
        console.log(`     User: ${fee.user_id}`);
        console.log(`     Amount (USDT): $${fee.amount_usdt}`);
        console.log(`     Status: ${fee.status}`);
        console.log(`     Created: ${fee.created_at}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    if (fees.length > 0 && fees[0].amount_usdt) {
      console.log(`✅ Micro-fees are being recorded! Latest fee: $${fees[0].amount_usdt}`);
    } else {
      console.log('⚠️  No fees recorded yet. Check if sync actually charged a fee.');
    }
    console.log('='.repeat(80) + '\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

test();
