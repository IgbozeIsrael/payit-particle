#!/usr/bin/env node
require('dotenv').config();
const db = require('./src/db');

// Query the database for accounts
const accounts = db.db.prepare(`
  SELECT 
    a.account_id,
    a.profile_id,
    a.nuvion_account_id,
    a.nuvion_account_no,
    p.type as profile_type,
    p.nuvion_entity_id
  FROM accounts a
  JOIN profiles p ON a.profile_id = p.profile_id
  WHERE p.user_id = 'did:ethr:0xaf0245eb93910b2a02901654d72644090579015A'
  ORDER BY p.type, a.nuvion_account_no
`).all();

console.log(`Found ${accounts.length} accounts\n`);

// Group by profile type
const personalAccounts = accounts.filter(a => a.profile_type === 'personal');
const businessAccounts = accounts.filter(a => a.profile_type === 'business');

console.log(`Personal Accounts (${personalAccounts.length}):`);
personalAccounts.forEach((a, i) => {
  console.log(`[${i+1}] ${a.nuvion_account_no}`);
  console.log(`    Nuvion ID: ${a.nuvion_account_id}`);
  console.log(`    Profile Entity: ${a.nuvion_entity_id}`);
});

console.log(`\nBusiness Accounts (${businessAccounts.length}):`);
businessAccounts.forEach((a, i) => {
  console.log(`[${i+1}] ${a.nuvion_account_no}`);
  console.log(`    Nuvion ID: ${a.nuvion_account_id}`);
  console.log(`    Profile Entity: ${a.nuvion_entity_id}`);
});

// Find the business account 9134148532
const businessNGN = accounts.find(a => a.nuvion_account_no === '9134148532');
if (businessNGN) {
  console.log(`\n✅ Found business account 9134148532:`);
  console.log(`   Account ID: ${businessNGN.account_id}`);
  console.log(`   Nuvion Account ID: ${businessNGN.nuvion_account_id}`);
  console.log(`   Profile Type: ${businessNGN.profile_type}`);
  console.log(`   Profile Entity ID: ${businessNGN.nuvion_entity_id}`);
} else {
  console.log(`\n❌ Business account 9134148532 not found in database`);
}
