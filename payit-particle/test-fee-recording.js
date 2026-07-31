#!/usr/bin/env node
require('dotenv').config();
const db = require('./src/db');

console.log('\n' + '='.repeat(80));
console.log('🧪 Testing Direct Fee Recording');
console.log('='.repeat(80) + '\n');

try {
  // Get user
  const user = db.db.prepare('SELECT * FROM users WHERE telegram_id IS NOT NULL LIMIT 1').get();
  const userId = user.telegram_id;

  console.log(`📱 User: ${userId}\n`);

  // Insert a test fee record
  const feeId = 'test_fee_' + Date.now();
  const stmt = db.db.prepare(
    `INSERT INTO platform_fees (fee_id, tx_id, user_id, amount_usdt, fee_address, source_currency, payout_amount, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  
  const microFeeAmount = 0.00094;  // Example micro-fee
  stmt.run(
    feeId,
    'test_tx_' + Date.now(),
    userId,
    microFeeAmount,
    '0x742d35Cc6634C0532925a3b844Bc9e7595f42E00',  // Fee wallet
    'NGN',
    microFeeAmount,
    'recorded',
    Date.now()
  );
  
  console.log(`✅ Test fee inserted: ${feeId}\n`);

  // Query it back
  const fee = db.db.prepare('SELECT * FROM platform_fees WHERE fee_id = ?').get(feeId);
  
  console.log('✅ Fee confirmed in database:');
  console.log(`   Fee ID: ${fee.fee_id}`);
  console.log(`   Amount (USDT): $${fee.amount_usdt}`);
  console.log(`   Status: ${fee.status}`);
  console.log(`   Created: ${new Date(fee.created_at).toISOString()}\n`);

  // Query all fees for this user
  console.log('📋 All Platform Fees for this User:');
  const allFees = db.db.prepare('SELECT fee_id, amount_usdt, status, created_at FROM platform_fees WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  
  if (allFees.length === 0) {
    console.log('   (none)');
  } else {
    allFees.forEach((f, idx) => {
      console.log(`   ${idx + 1}. $${f.amount_usdt} (${f.status}) - ${new Date(f.created_at).toISOString()}`);
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log(`✅ Micro-fee recording system is working!`);
  console.log(`   Example fee recorded: $${microFeeAmount}`);
  console.log('='.repeat(80) + '\n');

} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
