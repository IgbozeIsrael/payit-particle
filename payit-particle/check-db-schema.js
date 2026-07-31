#!/usr/bin/env node
require('dotenv').config();
const db = require('./src/db');

console.log('Accounts table schema and content:\n');

// Get table schema
const schema = db.db.pragma('table_info(accounts)');
console.log('SCHEMA:');
schema.forEach(col => {
  console.log(`  ${col.name}: ${col.type}${col.pk ? ' (PRIMARY KEY)' : ''}${col.notnull ? ' NOT NULL' : ''}`);
});

console.log('\nAll accounts in database:\n');

const allAccounts = db.db.prepare(`
  SELECT 
    a.account_id,
    a.profile_id,
    a.nuvion_account_id,
    a.nuvion_account_no,
    a.purpose,
    a.created_at,
    p.type as profile_type,
    p.nuvion_entity_id as profile_entity_id
  FROM accounts a
  JOIN profiles p ON a.profile_id = p.profile_id
  WHERE p.user_id = 'did:ethr:0xaf0245eb93910b2a02901654d72644090579015A'
  ORDER BY a.created_at DESC
`).all();

console.log(`Total: ${allAccounts.length} accounts\n`);

// Group by profile type
const byProfile = {};
allAccounts.forEach(acc => {
  if (!byProfile[acc.profile_type]) byProfile[acc.profile_type] = [];
  byProfile[acc.profile_type].push(acc);
});

Object.entries(byProfile).forEach(([type, accs]) => {
  console.log(`${type.toUpperCase()} PROFILE: ${accs.length} accounts`);
  accs.forEach((acc, i) => {
    console.log(`  [${i+1}] Account #${acc.nuvion_account_no}`);
    console.log(`      ID: ${acc.nuvion_account_id}`);
    console.log(`      Purpose: ${acc.purpose}`);
    console.log(`      Entity: ${acc.profile_entity_id}`);
  });
  console.log();
});

// Check for the business account
const bizNGN = db.db.prepare(`
  SELECT * FROM accounts WHERE nuvion_account_no LIKE '%9134%'
`).all();

if (bizNGN.length > 0) {
  console.log('Found account matching 9134:');
  console.log(JSON.stringify(bizNGN, null, 2));
} else {
  console.log('No account matching 9134 found');
}
