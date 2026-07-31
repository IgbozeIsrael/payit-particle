#!/usr/bin/env node

/**
 * Debug Fee Recording Script
 * 
 * This script debugs why platform fees are not being recorded
 */

require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.resolve(__dirname, './payit.db');
const db = new Database(dbPath);

// Enable WAL mode
try {
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 10000');
} catch (e) {
  console.warn('[DB] Pragma setting notice:', e.message);
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('PLATFORM FEES DEBUG ANALYSIS');
  console.log('='.repeat(80) + '\n');

  try {
    // Check if recordPlatformFee function exists
    console.log('✓ Checking database structure...\n');

    // Check if platform_fees table exists
    const tableInfo = db.pragma('table_info(platform_fees)');
    console.log(`✓ platform_fees table exists: ${tableInfo.length > 0}`);
    console.log(`  Columns: ${tableInfo.map(col => col.name).join(', ')}\n`);

    // Query all fees
    console.log('✓ Querying all fees from database...\n');
    const allFees = db.prepare('SELECT * FROM platform_fees').all();
    console.log(`  Total fees in database: ${allFees.length}\n`);

    if (allFees.length > 0) {
      console.log('Recent fees:');
      allFees.slice(0, 5).forEach((fee, idx) => {
        console.log(`  ${idx + 1}. Fee ID: ${fee.fee_id}`);
        console.log(`     User: ${fee.user_id}`);
        console.log(`     Amount: $${fee.amount_usdt}`);
        console.log(`     Address: ${fee.fee_address}`);
        console.log('');
      });
    }

    // Check audit logs for sync actions
    console.log('✓ Checking audit logs for sync actions...\n');
    const syncLogs = db.prepare(`
      SELECT * FROM audit_logs 
      WHERE action LIKE 'nuvion_sync%'
      ORDER BY created_at DESC
      LIMIT 10
    `).all();

    console.log(`  Total sync audit logs: ${syncLogs.length}\n`);
    if (syncLogs.length > 0) {
      console.log('Recent sync logs:');
      syncLogs.forEach((log, idx) => {
        const date = new Date(log.created_at).toLocaleString();
        console.log(`  ${idx + 1}. [${date}] User: ${log.user_id}`);
        console.log(`     Action: ${log.action}`);
        console.log(`     Details: ${log.details}`);
        console.log('');
      });
    }

    // Test the fee recording function directly
    console.log('✓ Testing recordPlatformFee function...\n');

    const testFeeData = {
      userId: 'test_user_123',
      txId: 'tx_test_' + Date.now(),
      amountUsdt: 0.01,
      feeAddress: '0x62f0072F397Eb73D75da7502F5E9394a83C450b9',
      sourceCurrency: 'NGN',
      payoutAmount: 0.01,
      note: 'Test fee record'
    };

    try {
      const result = db.recordPlatformFee(testFeeData);
      console.log(`  ✅ Direct recordPlatformFee call successful`);
      console.log(`     Result: ${JSON.stringify(result)}\n`);

      // Now query to verify it was inserted
      const verifyFee = db.prepare('SELECT * FROM platform_fees WHERE user_id = ?').get('test_user_123');
      if (verifyFee) {
        console.log(`  ✅ Test fee was recorded successfully`);
        console.log(`     Fee ID: ${verifyFee.fee_id}`);
        console.log(`     Amount: $${verifyFee.amount_usdt}\n`);

        // Clean up test fee
        db.prepare('DELETE FROM platform_fees WHERE fee_id = ?').run(verifyFee.fee_id);
        console.log(`  🧹 Cleaned up test fee\n`);
      }
    } catch (err) {
      console.error(`  ❌ recordPlatformFee error: ${err.message}\n`);
    }

    // Check deposits that were recorded during syncs
    console.log('✓ Checking HD deposits...\n');
    const deposits = db.prepare('SELECT * FROM hd_deposits ORDER BY created_at DESC LIMIT 10').all();
    console.log(`  Total deposits: ${deposits.length}\n`);

    if (deposits.length > 0) {
      console.log('Recent deposits:');
      deposits.forEach((dep, idx) => {
        const date = new Date(dep.created_at).toLocaleString();
        console.log(`  ${idx + 1}. [${date}] Deposit ID: ${dep.deposit_id}`);
        console.log(`     User: ${dep.user_id}`);
        console.log(`     Amount: $${dep.expected_amount} ${dep.currency}`);
        console.log('');
      });
    }

    // Check transactions
    console.log('✓ Checking transactions...\n');
    const transactions = db.prepare('SELECT * FROM transactions ORDER BY timestamp DESC LIMIT 10').all();
    console.log(`  Total transactions: ${transactions.length}\n`);

    if (transactions.length > 0) {
      console.log('Recent transactions:');
      transactions.forEach((tx, idx) => {
        console.log(`  ${idx + 1}. TX ID: ${tx.tx_id}`);
        console.log(`     User: ${tx.user_id}`);
        console.log(`     Amount: ${tx.amount} ${tx.token}`);
        console.log('');
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('DEBUG ANALYSIS COMPLETE');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ Error during debug:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    db.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
