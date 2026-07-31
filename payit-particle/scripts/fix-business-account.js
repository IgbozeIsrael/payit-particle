require('dotenv').config();
const https = require('https');
const db = require('../src/db');

const NUVION_API_KEY = process.env.NUVION_API_KEY;
const NUVION_BASE = process.env.NUVION_BASE_URL || 'https://api.nuvion.co';

async function nuvionRequest(endpoint, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(NUVION_BASE + endpoint);
    const body = data ? JSON.stringify(data) : null;
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': 'Bearer ' + NUVION_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
      }
    };
    const req = https.request(options, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        const parsed = JSON.parse(raw);
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
        else reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const ACCOUNT_ID = '01KYADY91R170H8GCHR6SPS09K';
  const ENTITY_ID = '01KX6JRFSQ97ARZFKBY6R31VJ7';
  const CORRECT_ACCOUNT_NO = '9687257081';
  const BUSINESS_NAME = 'Iboh Tech Ltd';
  const BENEFICIARY = 'IBOH TECH LTD / PayIT';

  console.log('=== Business Account Fix Script ===\n');

  // Step 1: Fix account number in DB
  console.log('Step 1: Fixing account number in database...');
  db.db.prepare(
    "UPDATE accounts SET nuvion_account_no = ? WHERE nuvion_account_id = ?"
  ).run(CORRECT_ACCOUNT_NO, ACCOUNT_ID);
  db.db.prepare(
    "UPDATE users SET nuvion_business_account_no = ? WHERE nuvion_business_account_no = '9687257082' OR nuvion_business_account_no IS NULL AND business_name IS NOT NULL"
  ).run(CORRECT_ACCOUNT_NO);
  console.log('  DB account number corrected to:', CORRECT_ACCOUNT_NO);

  // Verify DB fix
  const acc = db.db.prepare("SELECT * FROM accounts WHERE nuvion_account_id = ?").get(ACCOUNT_ID);
  console.log('  DB record now:', acc);

  // Step 2: Update beneficiary name on Nuvion
  console.log('\nStep 2: Updating beneficiary name on Nuvion...');
  try {
    const detailsRes = await nuvionRequest('/account-details', 'POST', {
      account_id: ACCOUNT_ID,
      beneficiary_name: BENEFICIARY
    });
    console.log('  Beneficiary updated:', JSON.stringify(detailsRes, null, 2));
  } catch (err) {
    console.warn('  Beneficiary update error (may already be set):', err.message);
  }

  // Step 3: Update business entity display name on Nuvion
  console.log('\nStep 3: Patching business entity name on Nuvion...');
  try {
    const entityRes = await nuvionRequest(`/business-entities/${ENTITY_ID}`, 'PATCH', {
      name: BUSINESS_NAME,
      business: { legal_name: BUSINESS_NAME }
    });
    console.log('  Entity name updated:', JSON.stringify(entityRes, null, 2));
  } catch (err) {
    console.warn('  Entity patch error:', err.message);
  }

  // Step 4: Re-fetch and verify
  console.log('\nStep 4: Verifying final account details from Nuvion...');
  try {
    const finalDetails = await nuvionRequest(`/account-details?account_id=${ACCOUNT_ID}`, 'GET');
    const detail = finalDetails?.data?.data?.[0];
    console.log('  Final account number:', detail?.account_number);
    console.log('  Final beneficiary:   ', detail?.beneficiary_name);
    console.log('  Final status:        ', detail?.status);
    console.log('  Issuer:              ', detail?.issuer?.name);
    if (detail?.account_number !== CORRECT_ACCOUNT_NO) {
      console.log('\n  ⚠️  Nuvion still reports:', detail?.account_number, '— DB now matches this value.');
    } else {
      console.log('\n  ✅ Account number matches DB. All fixed.');
    }
  } catch (err) {
    console.error('  Final check error:', err.message);
  }
}

main().catch(err => console.error('Fatal:', err));
