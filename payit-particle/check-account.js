const db = require('./src/db');

const targetAccount = '9134148532';

// Find deposits to this account
const deposits = db.db.prepare(
  'SELECT * FROM hd_deposits WHERE virtual_account_no = ? ORDER BY created_at DESC'
).all(targetAccount);

console.log('\n=== DEPOSITS TO ACCOUNT 9134148532 ===');
console.log(JSON.stringify(deposits, null, 2));

// Nuvion webhook events for this account
let webhooks = [];
try {
  webhooks = db.db.prepare(
    "SELECT * FROM webhook_events WHERE payload LIKE ? ORDER BY created_at DESC LIMIT 20"
  ).all(`%${targetAccount}%`);
  console.log('\n=== WEBHOOK EVENTS ===');
  console.log(JSON.stringify(webhooks, null, 2));
} catch(e) {
  console.log('webhook_events error:', e.message);
}

// All deposits for this user
const userId = "did:ethr:0xaf0245eb93910b2a02901654d72644090579015A";
const smartAccBiz = "0x37e625e993F63de87be5f0a801462aCABfEA4bC9";
const smartAccPersonal = "0x442e2E7EAC9c3f190e837d5ef74dD037EC235B24";

const allUserDeposits = db.db.prepare(
  'SELECT * FROM hd_deposits WHERE user_id = ? OR deposit_address = ? OR deposit_address = ? ORDER BY created_at DESC'
).all(userId, smartAccBiz, smartAccPersonal);
console.log('\n=== ALL DEPOSITS FOR USER ===');
console.log(JSON.stringify(allUserDeposits, null, 2));

// All accounts for this user
const allAccounts = db.db.prepare(
  "SELECT * FROM accounts WHERE profile_id LIKE ? ORDER BY created_at DESC"
).all(`%${userId}%`);
console.log('\n=== ALL ACCOUNTS FOR USER ===');
console.log(JSON.stringify(allAccounts, null, 2));

// Transactions
const txs = db.db.prepare(
  'SELECT * FROM transactions WHERE user_id = ? OR sender = ? OR recipient = ? ORDER BY timestamp DESC LIMIT 30'
).all(userId, smartAccBiz, smartAccPersonal);
console.log('\n=== TRANSACTIONS ===');
console.log(JSON.stringify(txs, null, 2));

// List all tables and columns
const tables = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('\n=== DB TABLES ===');
tables.forEach(t => {
  const cols = db.db.prepare(`PRAGMA table_info(${t.name})`).all();
  console.log(`${t.name}: ${cols.map(c => c.name).join(', ')}`);
});

// Nuvion balance from DB
try {
  const balRows = db.db.prepare("SELECT * FROM nuvion_balances WHERE user_id = ?").all(userId);
  console.log('\n=== NUVION BALANCES TABLE ===');
  console.log(JSON.stringify(balRows, null, 2));
} catch(e) {
  console.log('nuvion_balances error:', e.message);
}
