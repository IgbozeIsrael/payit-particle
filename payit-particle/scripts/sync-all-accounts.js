/**
 * sync-all-accounts.js
 * Fetches all real Nuvion accounts and details for the user,
 * and updates SQLite accounts table with real account numbers, IBANs, and bank names.
 */
const nuvion = require('../src/nuvion-service');
const db = require('../src/db');

const TELEGRAM_ID = 'did:ethr:0xaf0245eb93910b2a02901654d72644090579015A';

async function run() {
  const persProfile = db.getProfileByType(TELEGRAM_ID, 'personal');
  const bizProfile = db.getProfileByType(TELEGRAM_ID, 'business');

  console.log('Syncing all multi-currency fiat accounts for user:', TELEGRAM_ID);
  console.log('Personal Profile:', persProfile?.profile_id);
  console.log('Business Profile:', bizProfile?.profile_id);

  const allAccsResp = await nuvion.requestNuvionWithFallback('/accounts', 'GET');
  const allAccs = allAccsResp?.data?.data || allAccsResp?.data || [];

  for (const acc of allAccs) {
    if (acc.meta?.platform_user_id !== TELEGRAM_ID || acc.status !== 'active') continue;

    let accNum = acc.nuvion_ban;
    let bankName = 'Flutterwave MFB / Nuvion Partner Bank';
    let routingNo = null;

    try {
      const detailsResp = await nuvion.requestNuvionWithFallback('/account-details?account_id=' + acc.id, 'GET');
      const detailsList = detailsResp?.data?.data || detailsResp?.data || [];
      const det = detailsList[0] || {};
      if (det.account_number) accNum = det.account_number;
      if (det.issuer?.name) bankName = det.issuer.name;
      if (det.routing_number) routingNo = det.routing_number;
    } catch (e) {
      console.warn(`Could not get details for ${acc.id}:`, e.message);
    }

    if (bankName.toLowerCase().includes('vfd')) {
      bankName = 'Flutterwave MFB / Nuvion Partner Bank';
    }

    const currency = acc.currency;
    const isBiz = acc.meta?.context === 'business' || (acc.display_name && acc.display_name.includes('Business'));
    const targetProfileId = isBiz ? bizProfile?.profile_id : persProfile?.profile_id;
    const prefix = isBiz ? 'acc_b_' : 'acc_p_';
    const beneficiary = isBiz ? 'IBOH TECH LTD / PayIT' : 'IBOH IGBOZE IGBOZE / PayIT';

    if (targetProfileId && accNum) {
      db.db.prepare(`
        INSERT INTO accounts (account_id, profile_id, nuvion_account_id, nuvion_account_no, purpose, bank_name, beneficiary_name, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
        ON CONFLICT(account_id) DO UPDATE SET
          nuvion_account_no = excluded.nuvion_account_no,
          nuvion_account_id = excluded.nuvion_account_id,
          bank_name = excluded.bank_name,
          beneficiary_name = excluded.beneficiary_name,
          status = 'active'
      `).run(`${prefix}${currency}_${TELEGRAM_ID}`, targetProfileId, acc.id, accNum, currency, bankName, beneficiary, Date.now());

      console.log(`Synced ${currency} (${isBiz ? 'business' : 'personal'}): ${accNum} | Bank: ${bankName}`);
    }
  }

  console.log('\n--- Personal Accounts in SQLite ---');
  console.log(db.db.prepare('SELECT purpose, nuvion_account_no, bank_name, beneficiary_name FROM accounts WHERE profile_id = ?').all(persProfile?.profile_id));

  console.log('\n--- Business Accounts in SQLite ---');
  console.log(db.db.prepare('SELECT purpose, nuvion_account_no, bank_name, beneficiary_name FROM accounts WHERE profile_id = ?').all(bizProfile?.profile_id));
}

run().catch(e => {
  console.error('Fatal error in sync:', e);
  process.exit(1);
});
