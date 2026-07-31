const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../payit.db');
const db = new Database(dbPath);

console.log('Starting architecture migration...');

const users = db.prepare('SELECT * FROM users').all();
let profilesCreated = 0;
let accountsCreated = 0;

for (const user of users) {
  const telegramId = user.telegram_id;
  
  // 1. Create Personal Profile
  const personalProfileId = `prof_p_${telegramId}`; // deterministic ID
  db.prepare(`
    INSERT OR IGNORE INTO profiles (profile_id, user_id, type, nuvion_entity_id, universal_account_address, name, email, logo, created_at)
    VALUES (?, ?, 'personal', NULL, ?, ?, ?, NULL, ?)
  `).run(
    personalProfileId,
    telegramId,
    user.personal_smart_account || user.owner_address, // Use owner address if missing
    user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Personal Profile',
    user.business_email || `${telegramId}@payit.app`, // Personal email fallback
    Date.now()
  );
  profilesCreated++;

  // 1b. Map Personal Account
  if (user.nuvion_account_no && user.nuvion_account_id) {
    const accId = `acc_p_${telegramId}`;
    db.prepare(`
      INSERT OR IGNORE INTO accounts (account_id, profile_id, nuvion_account_id, nuvion_account_no, purpose, created_at)
      VALUES (?, ?, ?, ?, 'main', ?)
    `).run(accId, personalProfileId, user.nuvion_account_id, user.nuvion_account_no, Date.now());
    accountsCreated++;
  }

  // 2. Create Business Profile (if registered)
  if (user.business_name && user.business_smart_account) {
    const bizProfileId = `prof_b_${telegramId}`;
    db.prepare(`
      INSERT OR IGNORE INTO profiles (profile_id, user_id, type, nuvion_entity_id, universal_account_address, name, email, logo, created_at)
      VALUES (?, ?, 'business', NULL, ?, ?, ?, NULL, ?)
    `).run(
      bizProfileId,
      telegramId,
      user.business_smart_account,
      user.business_name,
      user.business_email || null,
      Date.now()
    );
    profilesCreated++;
  }
}

console.log(`Migration Complete. Ensured ${profilesCreated} profiles and ${accountsCreated} accounts.`);
