#!/usr/bin/env node
require('dotenv').config();
const db = require('./src/db');

const user = db.db.prepare("SELECT * FROM users WHERE business_email LIKE '%igboze%' LIMIT 1").get();
console.log('User ID:', user.user_id);
console.log('Business Nuvion Account (from users table):', user.nuvion_account_no);
console.log('');

const profiles = db.db.prepare("SELECT * FROM profiles WHERE user_id = ?").all(user.user_id);

profiles.forEach(p => {
  console.log(`Profile: ${p.type} (${p.profile_id})`);
  const accs = db.db.prepare("SELECT * FROM accounts WHERE profile_id = ?").all(p.profile_id);
  console.log(`  Total accounts: ${accs.length}`);
  accs.forEach(a => {
    console.log(`    - nuvion_account_no: ${a.nuvion_account_no}, nuvion_account_id: ${a.nuvion_account_id}`);
  });
  console.log('');
});
