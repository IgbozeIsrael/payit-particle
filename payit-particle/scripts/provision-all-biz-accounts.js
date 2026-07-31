/**
 * provision-all-biz-accounts.js
 * Provisions distinct, dedicated business fiat accounts on Nuvion for ALL currencies:
 * NGN, USD, GBP, EUR, KES, GHS, ZAR, CAD, AED, UGX, TZS
 * under context='business', and writes them into SQLite DB.
 */
const nuvion = require('../src/nuvion-service');
const db = require('../src/db');

const TELEGRAM_ID = 'did:ethr:0xaf0245eb93910b2a02901654d72644090579015A';

async function run() {
  const bizProfile = db.getProfileByType(TELEGRAM_ID, 'business');
  if (!bizProfile) {
    console.error('No business profile found.');
    process.exit(1);
  }

  const bizName = bizProfile.name || 'IBOH TECH LTD';
  const entityId = bizProfile.nuvion_entity_id || '01KX6JRFSQ97ARZFKBY6R31VJ7';

  console.log(`=== Provisioning Business Fiat Accounts for "${bizName}" ===`);
  console.log('Business Profile ID:', bizProfile.profile_id);
  console.log('Entity ID:          ', entityId);

  const currencies = ['NGN', 'USD', 'GBP', 'EUR', 'KES', 'GHS', 'ZAR', 'CAD', 'AED', 'UGX', 'TZS'];

  const userObj = {
    business_name: bizName,
    name: bizName,
    email: bizProfile.email || 'ibohtech@payit.app',
    registration_number: 'RC8996143',
    tin: 'TIN8996143',
    nuvion_entity_id: entityId
  };

  for (const c of currencies) {
    console.log(`\n--- Provisioning Business ${c} Account ---`);
    try {
      const accInfo = await nuvion.getOrCreateDepositAccount(
        TELEGRAM_ID,
        c,
        userObj,
        `tx_biz_init_${c}_${Date.now()}`,
        'business'
      );

      const accNo = accInfo?.account_number;
      const accId = accInfo?.account_id;

      if (!accNo || !accId) {
        console.warn(`[Warning] Business ${c} account created but no account_number returned yet.`);
        continue;
      }

      let bankName = accInfo?.issuer?.name || (c === 'NGN' ? 'Flutterwave MFB / Nuvion Partner Bank' : c === 'USD' ? 'Cross River Bank' : 'Global Remit Financial Services Ltd');
      if (bankName.toLowerCase().includes('vfd')) {
        bankName = 'Flutterwave MFB / Nuvion Partner Bank';
      }

      const beneficiary = `${bizName.toUpperCase()} / PayIT`;

      db.db.prepare(`
        INSERT INTO accounts (account_id, profile_id, nuvion_account_id, nuvion_account_no, purpose, bank_name, beneficiary_name, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
        ON CONFLICT(account_id) DO UPDATE SET
          nuvion_account_no = excluded.nuvion_account_no,
          nuvion_account_id = excluded.nuvion_account_id,
          bank_name = excluded.bank_name,
          beneficiary_name = excluded.beneficiary_name,
          status = 'active'
      `).run(`acc_b_${c}_${TELEGRAM_ID}`, bizProfile.profile_id, accId, accNo, c, bankName, beneficiary, Date.now());

      if (c === 'NGN') {
        db.updateUserBusinessNuvionAccount(TELEGRAM_ID, accNo, accId);
      }

      console.log(`[SUCCESS] Business ${c}: ${accNo} | Bank: ${bankName} | ID: ${accId}`);
    } catch (e) {
      console.error(`[ERROR] Failed to provision Business ${c}:`, e.message);
    }
  }

  console.log('\n=============================================');
  console.log('Final Business Accounts in SQLite Database:');
  const rows = db.db.prepare('SELECT purpose, nuvion_account_no, bank_name, beneficiary_name, status FROM accounts WHERE profile_id = ?').all(bizProfile.profile_id);
  console.table(rows);
}

run().catch(e => {
  console.error('Fatal error in business provisioning:', e);
  process.exit(1);
});
