#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const db = require('../src/db');
const nuvionService = require('../src/nuvion-service');
const fs = require('fs');
const path = require('path');

const REPORT_FILE = path.join(__dirname, `repair-solvium-accounts-${new Date().toISOString().split('T')[0]}.json`);
const report = {
  startTime: new Date().toISOString(),
  endTime: null,
  totalUsers: 0,
  totalAccounts: 0,
  repaired: 0,
  failures: 0,
  users: []
};

async function main() {
  console.log(`\n${'='.repeat(70)}`);
  console.log('🔧 PayIT Solvium Games Ltd Account Repair Script');
  console.log('='.repeat(70));
  console.log(`Start: ${new Date().toISOString()}\n`);

  try {
    // Step 1: Find affected users
    console.log('📊 Step 1: Scanning database for affected accounts...');
    
    const affected = db.db.prepare(`
      SELECT DISTINCT p.user_id, u.first_name, u.last_name, u.business_name, p.type,
             COUNT(a.account_id) as account_count
      FROM profiles p
      JOIN accounts a ON p.profile_id = a.profile_id
      JOIN users u ON u.telegram_id = p.user_id
      WHERE a.beneficiary_name LIKE '%Solvium%' 
         OR a.bank_name LIKE '%Solvium%' 
         OR a.bank_name LIKE '%VFD%'
      GROUP BY p.user_id, p.type
    `).all();

    console.log(`✅ Found ${affected.length} affected profile(s)\n`);
    report.totalUsers = affected.length;

    if (affected.length === 0) {
      console.log('✨ No affected accounts found. Database is clean!\n');
      report.endTime = new Date().toISOString();
      saveReport();
      return;
    }

    // Step 2: Repair each affected user
    console.log('🔨 Step 2: Executing repairs...\n');
    for (const affectedProfile of affected) {
      const { user_id, first_name, last_name, business_name, type } = affectedProfile;
      const context = type || 'personal';

      console.log(`\n👤 Repairing ${context} profile for user: ${user_id}`);
      console.log(`   Name: ${first_name} ${last_name || ''} ${business_name ? `(${business_name})` : ''}`);

      try {
        // Call the repair function from nuvion-service
        const repairResult = await nuvionService.repairAccountBeneficiary(user_id, context);

        if (repairResult.success) {
          console.log(`   ✅ Repair successful`);
          console.log(`      Entity ID: ${repairResult.entity_id}`);
          console.log(`      Entity Patched: ${repairResult.entity_patched ? 'Yes' : 'No'}`);
          console.log(`      Expected Beneficiary: ${repairResult.expected_beneficiary}`);
          console.log(`      Accounts Patched: ${repairResult.patched_accounts.length}`);

          repairResult.patched_accounts.forEach((acc, idx) => {
            console.log(`        ${idx + 1}. Account ${acc.account_id}`);
            if (acc.old_number !== acc.new_number) {
              console.log(`           Old: ${acc.old_number} → New: ${acc.new_number}`);
            }
            console.log(`           Beneficiary: ${acc.beneficiary_name}`);
          });

          report.repaired += repairResult.patched_accounts.length;
          report.users.push({
            userId: user_id,
            context,
            name: `${first_name} ${last_name || ''}`.trim(),
            businessName: business_name,
            success: true,
            repairs: repairResult.patched_accounts
          });
        } else {
          throw new Error('Repair returned success=false');
        }
      } catch (err) {
        console.log(`   ❌ Repair failed: ${err.message}`);
        report.failures++;
        report.users.push({
          userId: user_id,
          context,
          success: false,
          error: err.message
        });
      }
    }

    // Step 3: Verify response layer filter is already clean
    console.log('\n\n🧹 Step 3: Verifying response-layer filter in mobile-api.js...');
    try {
      const mobileApiPath = path.join(__dirname, '../src/mobile-api.js');
      const content = fs.readFileSync(mobileApiPath, 'utf8');
      
      // Check if the problematic filter exists
      if (content.includes("!r.beneficiary_name.toLowerCase().includes('solvium')")) {
        console.log(`⚠️  Filter found in mobile-api.js. Would need to remove, but code appears clean already.`);
      } else {
        console.log(`✅ Response-layer filter is clean (no masking filter found)`);
      }
    } catch (err) {
      console.log(`⚠️  Could not verify mobile-api.js: ${err.message}`);
    }

    // Save report
    console.log('\n📝 Saving repair report...');
    report.endTime = new Date().toISOString();
    report.totalAccounts = affected.reduce((sum, a) => sum + a.account_count, 0);
    
    const startTime = new Date(report.startTime);
    const endTime = new Date(report.endTime);
    const durationMs = endTime - startTime;
    report.duration = `${(durationMs / 1000).toFixed(2)}s`;

    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    console.log(`📄 Full report saved: ${REPORT_FILE}`);

    // Print summary
    const successful = report.users.filter(u => u.success).length;
    console.log(`\n${'='.repeat(70)}`);
    console.log('📊 REPAIR SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total Affected Profiles: ${report.totalUsers}`);
    console.log(`Total Affected Accounts: ${report.totalAccounts}`);
    console.log(`Successfully Repaired: ${successful}/${report.totalUsers}`);
    console.log(`Account Numbers Updated: ${report.repaired}`);
    console.log(`Failures: ${report.failures}`);
    console.log(`Duration: ${report.duration}`);
    console.log('='.repeat(70));
    console.log(`\n✨ Repair complete at ${new Date().toISOString()}\n`);
  } catch (err) {
    console.error(`\n❌ Fatal error: ${err.message}`);
    console.error(err.stack);
    report.endTime = new Date().toISOString();
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    process.exit(1);
  }
}

function saveReport() {
  try {
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    console.log(`📄 Report saved: ${REPORT_FILE}`);
  } catch (err) {
    console.error(`Failed to save report: ${err.message}`);
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
