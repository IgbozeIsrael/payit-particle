#!/usr/bin/env node

/**
 * Comprehensive Fee Verification Script
 * 
 * This script performs all operations to verify fees:
 * 1. Triggers Balance Sync to record fees from deposits (both personal & business)
 * 2. Queries Platform Fees from database
 * 3. Shows summary statistics with grouping by wallet address
 */

require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────

const dbPath = process.env.DB_PATH || path.resolve(__dirname, './payit.db');
const db = new Database(dbPath);

// Enable WAL mode for consistency
try {
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 10000');
} catch (e) {
  console.warn('[DB] Pragma setting notice:', e.message);
}

const nuvionService = require('./src/nuvion-service');

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXECUTION
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('PAYIT PLATFORM FEES VERIFICATION - COMPREHENSIVE REPORT');
  console.log('='.repeat(80) + '\n');

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // STEP 1: TRIGGER BALANCE SYNC (Both Personal & Business)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('='.repeat(80));
    console.log('STEP 1: TRIGGER BALANCE SYNC (Personal & Business Contexts)');
    console.log('='.repeat(80) + '\n');

    // Get first user from database
    const firstUser = db.prepare('SELECT telegram_id, user_id, personal_smart_account, business_smart_account, active_context FROM users LIMIT 1').get();

    if (!firstUser) {
      console.error('❌ No users found in database');
      return;
    }

    const userId = firstUser.user_id || firstUser.telegram_id;

    console.log(`📱 First User Found:`);
    console.log(`   Telegram ID: ${firstUser.telegram_id}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Personal Smart Account: ${firstUser.personal_smart_account}`);
    console.log(`   Business Smart Account: ${firstUser.business_smart_account}\n`);

    // Sync both contexts
    const contexts = ['personal', 'business'];
    const syncResults = {};

    for (const context of contexts) {
      console.log(`🔄 Triggering Balance Sync for ${context.toUpperCase()} context...\n`);

      try {
        const syncResult = await nuvionService.syncNuvionLiveAccountBalance(userId, context);

        syncResults[context] = syncResult;

        console.log(`✅ Balance Sync Result (${context}):`);
        console.log(`   Synced: ${syncResult.synced}`);
        console.log(`   Live NGN Balance: ₦${syncResult.liveNgn}`);
        console.log(`   USDT Amount: $${syncResult.usdtAmount}`);
        if (syncResult.depositId) console.log(`   Deposit ID: ${syncResult.depositId}`);
        if (syncResult.accountNumber) console.log(`   Account Number: ${syncResult.accountNumber}`);
        if (syncResult.accountId) console.log(`   Account ID: ${syncResult.accountId}`);
        if (syncResult.error) console.log(`   Error: ${syncResult.error}`);
        console.log('');
      } catch (err) {
        console.error(`❌ Error syncing ${context}:`, err.message);
        console.log('');
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 2: QUERY PLATFORM FEES
    // ──────────────────────────────────────────────────────────────────────────
    console.log('='.repeat(80));
    console.log('STEP 2: QUERY PLATFORM FEES FROM DATABASE');
    console.log('='.repeat(80) + '\n');

    const fees = db.prepare(`
      SELECT 
        fee_id,
        user_id,
        tx_id,
        amount_usdt,
        fee_address,
        source_currency,
        status,
        created_at
      FROM platform_fees
      ORDER BY created_at DESC
    `).all();

    if (fees.length === 0) {
      console.log('⚠️  No platform fees recorded yet\n');
      console.log('💡 NOTES:\n');
      console.log('   • Fees are recorded when a balance sync detects a NEW deposit');
      console.log('   • The fee amount is 0.75% of the deposited amount (converted to USDT)');
      console.log('   • Fees must be ≥ $0.01 USDT to be recorded (values below round to $0.00)');
      console.log('   • Platform margin formula: (deltaNgn / fxRate) * 0.0075 = feeAmount USD');
      console.log('   • With FX rate ~1400, deposits < ₦1,300 NGN result in <$0.01 fees\n');
    } else {
      console.log(`📊 Total Fees Recorded: ${fees.length}\n`);
      console.log('Fee Details:\n');

      fees.forEach((fee, index) => {
        const createdDate = new Date(fee.created_at).toLocaleString();
        console.log(`${index + 1}. Fee ID: ${fee.fee_id}`);
        console.log(`   User ID: ${fee.user_id}`);
        console.log(`   TX ID: ${fee.tx_id}`);
        console.log(`   Amount (USDT): $${fee.amount_usdt.toFixed(4)}`);
        console.log(`   Fee Address: ${fee.fee_address}`);
        console.log(`   Source Currency: ${fee.source_currency}`);
        console.log(`   Status: ${fee.status}`);
        console.log(`   Created At: ${createdDate}`);
        console.log('');
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 3: SUMMARY STATISTICS
    // ──────────────────────────────────────────────────────────────────────────
    console.log('='.repeat(80));
    console.log('STEP 3: SUMMARY STATISTICS');
    console.log('='.repeat(80) + '\n');

    console.log(`📈 Overall Statistics:\n`);
    console.log(`   Total Number of Fees: ${fees.length}`);

    if (fees.length > 0) {
      const totalAmount = fees.reduce((sum, fee) => sum + fee.amount_usdt, 0);
      console.log(`   Total Amount Collected: $${totalAmount.toFixed(4)} USDT`);
      console.log(`   Average Fee Per Transaction: $${(totalAmount / fees.length).toFixed(4)} USDT\n`);

      // ──────────────────────────────────────────────────────────────────────────
      // GROUP BY WALLET ADDRESS
      // ──────────────────────────────────────────────────────────────────────────
      console.log(`\n💰 Fees Grouped by Wallet Address:\n`);

      const feesByWallet = {};
      fees.forEach(fee => {
        if (!feesByWallet[fee.fee_address]) {
          feesByWallet[fee.fee_address] = {
            count: 0,
            total: 0,
            fees: []
          };
        }
        feesByWallet[fee.fee_address].count += 1;
        feesByWallet[fee.fee_address].total += fee.amount_usdt;
        feesByWallet[fee.fee_address].fees.push(fee);
      });

      let walletIndex = 1;
      Object.entries(feesByWallet).forEach(([address, data]) => {
        console.log(`${walletIndex}. Wallet Address: ${address}`);
        console.log(`   Number of Transactions: ${data.count}`);
        console.log(`   Total Collected: $${data.total.toFixed(4)} USDT`);
        console.log(`   Average Per Transaction: $${(data.total / data.count).toFixed(4)} USDT\n`);
        walletIndex++;
      });

      // ──────────────────────────────────────────────────────────────────────────
      // GROUPED BY CURRENCY
      // ──────────────────────────────────────────────────────────────────────────
      console.log(`\n🌍 Fees Grouped by Source Currency:\n`);

      const feesByCurrency = {};
      fees.forEach(fee => {
        if (!feesByCurrency[fee.source_currency]) {
          feesByCurrency[fee.source_currency] = {
            count: 0,
            total: 0
          };
        }
        feesByCurrency[fee.source_currency].count += 1;
        feesByCurrency[fee.source_currency].total += fee.amount_usdt;
      });

      let currencyIndex = 1;
      Object.entries(feesByCurrency).forEach(([currency, data]) => {
        console.log(`${currencyIndex}. Currency: ${currency}`);
        console.log(`   Number of Transactions: ${data.count}`);
        console.log(`   Total Collected: $${data.total.toFixed(4)} USDT\n`);
        currencyIndex++;
      });

      // ──────────────────────────────────────────────────────────────────────────
      // GROUPED BY USER
      // ──────────────────────────────────────────────────────────────────────────
      console.log(`\n👥 Fees Grouped by User:\n`);

      const feesByUser = {};
      fees.forEach(fee => {
        if (!feesByUser[fee.user_id]) {
          feesByUser[fee.user_id] = {
            count: 0,
            total: 0
          };
        }
        feesByUser[fee.user_id].count += 1;
        feesByUser[fee.user_id].total += fee.amount_usdt;
      });

      let userIndex = 1;
      Object.entries(feesByUser).forEach(([userId, data]) => {
        console.log(`${userIndex}. User ID: ${userId}`);
        console.log(`   Number of Transactions: ${data.count}`);
        console.log(`   Total Collected: $${data.total.toFixed(4)} USDT\n`);
        userIndex++;
      });

      // ──────────────────────────────────────────────────────────────────────────
      // RECENT ACTIVITY
      // ──────────────────────────────────────────────────────────────────────────
      console.log(`\n⏱️  Recent Fee Activity (Last 5):\n`);
      const recentFees = fees.slice(0, 5);
      recentFees.forEach((fee, index) => {
        const createdDate = new Date(fee.created_at).toLocaleString();
        console.log(`${index + 1}. ${createdDate} - User ${fee.user_id}: +$${fee.amount_usdt.toFixed(4)} USDT (${fee.source_currency})`);
      });
      console.log('');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 4: DEPOSITS & TRANSACTIONS
    // ──────────────────────────────────────────────────────────────────────────
    console.log('='.repeat(80));
    console.log('STEP 4: DEPOSITS & TRANSACTIONS VERIFICATION');
    console.log('='.repeat(80) + '\n');

    const deposits = db.prepare('SELECT * FROM hd_deposits ORDER BY created_at DESC LIMIT 10').all();
    const transactions = db.prepare('SELECT * FROM transactions ORDER BY timestamp DESC LIMIT 10').all();

    console.log(`📥 Recent Deposits: ${deposits.length} total\n`);
    deposits.slice(0, 3).forEach((dep, idx) => {
      const date = new Date(dep.created_at).toLocaleString();
      console.log(`${idx + 1}. [${date}] $${dep.expected_amount} ${dep.currency}`);
      console.log(`   Deposit ID: ${dep.deposit_id}`);
      console.log(`   User: ${dep.user_id}\n`);
    });

    console.log(`📊 Recent Transactions: ${transactions.length} total\n`);
    transactions.slice(0, 3).forEach((tx, idx) => {
      const date = new Date(tx.timestamp).toLocaleString();
      console.log(`${idx + 1}. [${date}] ${tx.amount} ${tx.token}`);
      console.log(`   TX ID: ${tx.tx_id}`);
      console.log(`   User: ${tx.user_id}\n`);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // FINAL SUMMARY
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(80));
    console.log('VERIFICATION COMPLETE');
    console.log('='.repeat(80) + '\n');

    if (fees.length > 0) {
      const totalCollected = fees.reduce((sum, fee) => sum + fee.amount_usdt, 0);
      console.log(`✅ Successfully collected $${totalCollected.toFixed(4)} USDT in platform fees`);
      console.log(`✅ Across ${fees.length} transactions`);
      console.log(`✅ From ${Object.keys(feesByUser).length} unique users`);
    } else {
      console.log(`ℹ️  No platform fees collected yet`);
      console.log(`ℹ️  Fee collection begins with deposits of >₦1,300 NGN`);
      console.log(`ℹ️  Current deposits: ${deposits.length}`);
      console.log(`ℹ️  Current deposits total: $${deposits.reduce((sum, d) => sum + d.expected_amount, 0).toFixed(2)} USDT`);
    }

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ Error during verification:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run main function
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
