#!/usr/bin/env node
require('dotenv').config();
const db = require('./src/db');
const crypto = require('crypto');

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('🔧 FIXING: Solvium Games Ltd Account Issue');
  console.log('='.repeat(80) + '\n');

  try {
    // ═══ STEP 1: Find the user and profiles ════════════════════════════════
    console.log('STEP 1: Finding user and profiles...\n');

    const user = db.db.prepare(`
      SELECT * FROM users 
      WHERE business_email LIKE '%igboze%'
        OR first_name LIKE '%Igboze%'
      LIMIT 1
    `).get();

    if (!user) {
      console.error('❌ No user found matching "igboze"');
      process.exit(1);
    }

    const telegramId = user.telegram_id;
    console.log(`✅ User: ${user.first_name} ${user.last_name}`);
    console.log(`   Business: ${user.business_name}`);
    console.log(`   Personal Account: ${user.nuvion_account_no}`);
    console.log(`   Business Account: ${user.nuvion_business_account_no}\n`);

    // Find profiles
    const personalProfile = db.db.prepare(`
      SELECT * FROM profiles WHERE user_id = ? AND type = 'personal'
    `).get(telegramId);

    const businessProfile = db.db.prepare(`
      SELECT * FROM profiles WHERE user_id = ? AND type = 'business'
    `).get(telegramId);

    if (!personalProfile || !businessProfile) {
      console.error('❌ Missing personal or business profile');
      process.exit(1);
    }

    console.log('✅ Profiles found');
    console.log(`   Personal: ${personalProfile.nuvion_entity_id}`);
    console.log(`   Business: ${businessProfile.nuvion_entity_id}\n`);

    // ═══ STEP 2: Check missing business account ════════════════════════════
    console.log('STEP 2: Checking for missing business NGN account...\n');

    const businessNGNAccount = db.db.prepare(`
      SELECT * FROM accounts
      WHERE profile_id = ? AND nuvion_account_no = ?
    `).get(businessProfile.profile_id, user.nuvion_business_account_no);

    if (!businessNGNAccount) {
      console.log(`⚠️  Business NGN account (${user.nuvion_business_account_no}) NOT in database!\n`);
      console.log('FIXING: Adding business account to database...\n');

      // Generate account ID if not already set
      let accountId = user.nuvion_business_account_id;
      if (!accountId) {
        accountId = 'acc_' + crypto.randomBytes(8).toString('hex').toUpperCase();
      }

      // Create account record
      const newAccountId = crypto.randomBytes(16).toString('hex').toUpperCase();
      const now = Math.floor(Date.now() / 1000);

      const stmt = db.db.prepare(`
        INSERT INTO accounts (account_id, profile_id, nuvion_account_id, nuvion_account_no, purpose, created_at, bank_name, beneficiary_name, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        newAccountId,
        businessProfile.profile_id,
        user.nuvion_business_account_id || accountId,
        user.nuvion_business_account_no,
        'NGN',
        now,
        'Flutterwave MFB / Nuvion Partner Bank',
        'IBOH TECH LTD / PayIT',
        'active'
      );

      if (result.changes > 0) {
        console.log(`✅ Business account added:`);
        console.log(`   Account ID: ${newAccountId}`);
        console.log(`   Account No: ${user.nuvion_business_account_no}`);
        console.log(`   Nuvion ID: ${user.nuvion_business_account_id || accountId}`);
        console.log(`   Beneficiary: IBOH TECH LTD / PayIT\n`);
      } else {
        console.error('❌ Failed to insert account');
        process.exit(1);
      }
    } else {
      console.log(`✅ Business account already in database`);
      console.log(`   Account No: ${businessNGNAccount.nuvion_account_no}`);
      console.log(`   Status: ${businessNGNAccount.status}\n`);
    }

    // ═══ STEP 3: Remove overlapping accounts from business profile ═════════
    console.log('STEP 3: Cleaning up overlapping accounts...\n');

    const personalAccountNumbers = db.db.prepare(`
      SELECT DISTINCT nuvion_account_no FROM accounts WHERE profile_id = ?
    `).all(personalProfile.profile_id).map(a => a.nuvion_account_no);

    const businessAccountNumbers = db.db.prepare(`
      SELECT DISTINCT nuvion_account_no FROM accounts WHERE profile_id = ?
    `).all(businessProfile.profile_id).map(a => a.nuvion_account_no);

    // Find accounts that should be removed from business (except the main business account)
    const accountsToRemove = businessAccountNumbers.filter(bn => 
      personalAccountNumbers.includes(bn) && bn !== user.nuvion_business_account_no
    );

    if (accountsToRemove.length > 0) {
      console.log(`Found ${accountsToRemove.length} overlapping accounts to remove from business profile:\n`);
      
      const deleteStmt = db.db.prepare(`
        DELETE FROM accounts WHERE profile_id = ? AND nuvion_account_no = ?
      `);

      let deletedCount = 0;
      accountsToRemove.forEach(accNo => {
        const result = deleteStmt.run(businessProfile.profile_id, accNo);
        if (result.changes > 0) {
          console.log(`  ✅ Removed: ${accNo}`);
          deletedCount++;
        }
      });
      console.log(`\nTotal removed: ${deletedCount}\n`);
    } else {
      console.log(`✅ No overlapping accounts to remove\n`);
    }

    // ═══ STEP 4: Verify Profile Separation ═════════════════════════════════
    console.log('STEP 4: Verifying account separation...\n');

    const finalPersonalAccounts = db.db.prepare(`
      SELECT nuvion_account_no FROM accounts WHERE profile_id = ?
      ORDER BY nuvion_account_no
    `).all(personalProfile.profile_id);

    const finalBusinessAccounts = db.db.prepare(`
      SELECT nuvion_account_no FROM accounts WHERE profile_id = ?
      ORDER BY nuvion_account_no
    `).all(businessProfile.profile_id);

    console.log(`Personal accounts: ${finalPersonalAccounts.length}`);
    console.log(`  Primary: ${user.nuvion_account_no}`);

    console.log(`\nBusiness accounts: ${finalBusinessAccounts.length}`);
    console.log(`  Primary: ${user.nuvion_business_account_no}`);

    // Check for remaining overlap
    const personalNumbers = new Set(finalPersonalAccounts.map(a => a.nuvion_account_no));
    const businessNumbers = new Set(finalBusinessAccounts.map(a => a.nuvion_account_no));
    const remainingOverlap = [...personalNumbers].filter(n => businessNumbers.has(n));

    if (remainingOverlap.length > 0) {
      console.log(`\n⚠️  WARNING: Remaining overlap (should only be NGN accounts):`);
      remainingOverlap.forEach(n => console.log(`   - ${n}`));
      console.log();
    } else {
      console.log(`\n✅ No account overlap!\n`);
    }

    // ═══ FINAL REPORT ────────────────────────────────────────────────────────
    console.log('='.repeat(80));
    console.log('✨ FIX COMPLETE');
    console.log('='.repeat(80) + '\n');

    console.log('Summary:');
    console.log(`  ✅ User: ${user.first_name} ${user.last_name} (${user.business_name})`);
    console.log(`  ✅ Personal Profile: ${personalProfile.profile_id}`);
    console.log(`     Entity: ${personalProfile.nuvion_entity_id}`);
    console.log(`     Main Account: ${user.nuvion_account_no}`);
    console.log(`  ✅ Business Profile: ${businessProfile.profile_id}`);
    console.log(`     Entity: ${businessProfile.nuvion_entity_id}`);
    console.log(`     Main Account: ${user.nuvion_business_account_no}`);
    console.log(`     Beneficiary: IBOH TECH LTD / PayIT`);

    console.log('\n📝 Database Changes:');
    console.log(`  ✅ Added business NGN account: ${user.nuvion_business_account_no}`);
    if (accountsToRemove.length > 0) {
      console.log(`  ✅ Cleaned up ${accountsToRemove.length} overlapping accounts`);
    }

    console.log('\n📝 Next Steps:');
    console.log('1. Restart the backend server (if running)');
    console.log('2. Reload the UI at http://localhost:5174/');
    console.log('3. Switch to Business profile');
    console.log('4. Verify you see "Iboh Tech Ltd" and account 9134148532');
    console.log('5. Verify account verified successfully in PayStack/Opay\n');

    process.exit(0);

  } catch (err) {
    console.error('Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
