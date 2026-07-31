#!/usr/bin/env node
require('dotenv').config();
const db = require('./src/db');
const nuvionService = require('./src/nuvion-service');

async function test() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 Debugging Nuvion Sync');
  console.log('='.repeat(80) + '\n');

  try {
    const user = db.db.prepare(`
      SELECT * FROM users WHERE business_email LIKE '%igboze%' LIMIT 1
    `).get();

    if (!user) {
      console.error('❌ User not found');
      process.exit(1);
    }

    const USER_ID = user.user_id || user.telegram_id;
    console.log(`User ID: ${USER_ID}\n`);

    // Get the profiles
    const profiles = db.db.prepare(`
      SELECT profile_id, type, nuvion_entity_id FROM profiles WHERE user_id = ?
    `).all(USER_ID);
    
    console.log('Profiles:');
    profiles.forEach(p => {
      console.log(`  - ${p.type}: ${p.profile_id} (entity: ${p.nuvion_entity_id})`);
    });
    console.log();

    // Get the accounts
    const accounts = db.db.prepare(`
      SELECT a.nuvion_account_id, a.nuvion_account_no, p.type, a.account_number
      FROM accounts a 
      JOIN profiles p ON a.profile_id = p.profile_id 
      WHERE p.user_id = ? AND a.currency = 'NGN'
    `).all(USER_ID);
    
    console.log('NGN Accounts:');
    accounts.forEach(a => {
      console.log(`  - ${a.type}: account_no=${a.nuvion_account_no}, nuvion_id=${a.nuvion_account_id}, account_number=${a.account_number}`);
    });
    console.log();

    // Now test what Nuvion returns
    console.log('Testing Nuvion API...\n');
    const nuvionService = require('./src/nuvion-service');
    
    // Access the private requestNuvionWithFallback function indirectly
    const accListRes = await nuvionService.requestNuvionWithFallback('/accounts', 'GET');
    const accList = accListRes?.data?.data || accListRes?.data || [];
    
    console.log(`Nuvion returned ${accList.length} accounts:\n`);
    
    let ngnAccounts = accList.filter(a => a.currency === 'NGN' && a.status === 'active');
    console.log(`NGN Active Accounts (${ngnAccounts.length}):`);
    ngnAccounts.forEach(acc => {
      console.log(`  - ID: ${acc.id}`);
      console.log(`    Account Number: ${acc.account_number}`);
      console.log(`    Balance: ${acc.balance?.current || acc.balance?.available || 0}`);
      console.log(`    Meta: ${JSON.stringify(acc.meta)}`);
      console.log(`    Status: ${acc.status}`);
      console.log();
    });

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

test();
