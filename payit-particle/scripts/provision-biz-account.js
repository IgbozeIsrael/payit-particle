/**
 * provision-biz-account.js
 * Provisions a dedicated Nuvion NGN account for the business profile,
 * saves it to the DB under acc_b_NGN_<userId>, and marks the personal
 * account row as belonging to the personal profile only.
 */
const nuvion = require('../src/nuvion-service');
const db = require('../src/db');

const TELEGRAM_ID = 'did:ethr:0xaf0245eb93910b2a02901654d72644090579015A';

async function run() {
  const bizProfile = db.getProfileByType(TELEGRAM_ID, 'business');
  const persProfile = db.getProfileByType(TELEGRAM_ID, 'personal');

  console.log('Business profile:', bizProfile);
  console.log('Personal profile nuvion_entity_id:', persProfile?.nuvion_entity_id);

  if (!bizProfile) {
    console.error('No business profile found. Aborting.');
    process.exit(1);
  }

  const entityId = bizProfile.nuvion_entity_id;
  if (!entityId) {
    console.error('Business profile has no nuvion_entity_id. Aborting.');
    process.exit(1);
  }

  const bizName = bizProfile.name || 'IBOH TECH LTD';

  console.log(`\nUsing entity ${entityId} for business "${bizName}"`);
  console.log('Checking for existing business NGN account on Nuvion...');

  // Fetch all accounts from Nuvion
  const allAccsResp = await nuvion.requestNuvionWithFallback('/accounts', 'GET');
  const allAccs = allAccsResp?.data?.data || allAccsResp?.data || [];

  // Look for an account that matches context='business' for this user
  const existingBiz = allAccs.find(a =>
    a.id !== '01KX6M4ST8S4J4DBT7NJT2S5H6' &&
    a.currency === 'NGN' &&
    a.status === 'active' &&
    a.meta?.platform_user_id === TELEGRAM_ID &&
    a.meta?.context === 'business'
  );

  // Also find the old personal NGN account to verify it's distinct
  const existingPersonal = allAccs.find(a =>
    a.id !== '01KX6M4ST8S4J4DBT7NJT2S5H6' &&
    a.currency === 'NGN' &&
    a.status === 'active' &&
    a.meta?.platform_user_id === TELEGRAM_ID &&
    (a.meta?.context === 'personal' || !a.meta?.context)
  );

  console.log('Personal NGN account on Nuvion:', existingPersonal?.id, '|', existingPersonal?.nuvion_ban);
  console.log('Business NGN account on Nuvion:', existingBiz?.id, '|', existingBiz?.nuvion_ban);

  let bizAccountId = existingBiz?.id;
  let bizAccountNo = null;
  let bizIssuer = null;

  if (!existingBiz) {
    console.log('\nNo dedicated business NGN account found — creating one...');
    const newAcc = await nuvion.requestNuvionWithFallback('/accounts', 'POST', {
      entity_id: entityId,
      type: 'checking',
      currency: 'NGN',
      display_name: `${bizName} - Business NGN Account`,
      meta: { platform_user_id: TELEGRAM_ID, context: 'business' }
    });
    bizAccountId = newAcc?.data?.account?.id || newAcc?.id;
    console.log('Created new business account:', bizAccountId);
  } else {
    bizAccountId = existingBiz.id;
    console.log('\nUsing existing business account:', bizAccountId);
  }

  // Provision account details (sets beneficiary_name on Nuvion + generates account_number)
  console.log('\nProvisioning account details for', bizAccountId, '...');
  let detailsObj = null;
  try {
    const detailsResp = await nuvion.requestNuvionWithFallback('/account-details', 'POST', {
      account_id: bizAccountId,
      beneficiary_name: `${bizName.toUpperCase()} / PayIT`
    });
    detailsObj = detailsResp?.data || detailsResp;
    console.log('Account details response:', JSON.stringify(detailsObj, null, 2));
  } catch (e) {
    console.warn('account-details POST error:', e.message);
  }

  // If POST returned no number, try GET
  if (!detailsObj?.account_number) {
    console.log('No number from POST — trying GET /account-details...');
    const getResp = await nuvion.requestNuvionWithFallback(`/account-details?account_id=${bizAccountId}`, 'GET');
    const detList = getResp?.data?.data || getResp?.data || [];
    detailsObj = detList[0] || null;
    console.log('GET account-details[0]:', JSON.stringify(detailsObj, null, 2));
  }

  bizAccountNo = detailsObj?.account_number || existingBiz?.nuvion_ban || null;
  bizIssuer = detailsObj?.issuer?.name || 'Flutterwave MFB / Nuvion Partner Bank';

  console.log('\nFinal business account number:', bizAccountNo);
  console.log('Final business account ID:    ', bizAccountId);
  console.log('Issuer:                       ', bizIssuer);

  if (!bizAccountNo) {
    console.error('\nCould not get a real account number for the business account. DB NOT updated.');
    process.exit(1);
  }

  // Clean any existing business NGN account rows so there's no duplicate
  db.db.prepare(`DELETE FROM accounts WHERE profile_id = ? AND purpose = 'NGN'`).run(bizProfile.profile_id);

  // Insert fresh row for business NGN account
  db.db.prepare(`
    INSERT INTO accounts (account_id, profile_id, nuvion_account_id, nuvion_account_no, purpose, bank_name, beneficiary_name, status, created_at)
    VALUES (?, ?, ?, ?, 'NGN', ?, ?, 'active', ?)
  `).run(
    `acc_b_NGN_${TELEGRAM_ID}`,
    bizProfile.profile_id,
    bizAccountId,
    bizAccountNo,
    bizIssuer.toLowerCase().includes('vfd') ? 'Flutterwave MFB / Nuvion Partner Bank' : bizIssuer,
    `${bizName.toUpperCase()} / PayIT`,
    Date.now()
  );

  // Update user shortcut for business
  db.updateUserBusinessNuvionAccount(TELEGRAM_ID, bizAccountNo, bizAccountId);

  console.log('\n--- DB Updated ---');
  console.log('Business accounts in DB:');
  console.log(db.db.prepare('SELECT * FROM accounts WHERE profile_id = ?').all(bizProfile.profile_id));
  console.log('\nPersonal accounts in DB:');
  if (persProfile) {
    console.log(db.db.prepare('SELECT * FROM accounts WHERE profile_id = ?').all(persProfile.profile_id));
  }

  // Verify they are distinct
  const persRow = db.db.prepare('SELECT nuvion_account_no FROM accounts WHERE profile_id = ? AND purpose = ?').get(persProfile?.profile_id, 'NGN');
  const bizRow  = db.db.prepare('SELECT nuvion_account_no FROM accounts WHERE profile_id = ? AND purpose = ?').get(bizProfile.profile_id, 'NGN');
  console.log(`\nPersonal NGN account_no: ${persRow?.nuvion_account_no}`);
  console.log(`Business NGN account_no: ${bizRow?.nuvion_account_no}`);
  if (persRow?.nuvion_account_no === bizRow?.nuvion_account_no) {
    console.error('\n[ERROR] Personal and business account numbers are STILL THE SAME!');
  } else {
    console.log('\n[OK] Personal and business NGN accounts are now distinct.');
  }
}

run().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
