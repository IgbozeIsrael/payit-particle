const https = require('https');
require('dotenv').config();

const API_KEY = process.env.NUVION_API_KEY;

function requestNuv(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const dataStr = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.nuvion.co',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        ...(dataStr ? { 'Content-Length': Buffer.byteLength(dataStr) } : {})
      }
    }, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch (e) { resolve({ status: res.statusCode, raw: d }); }
      });
    });
    req.on('error', reject);
    if (dataStr) req.write(dataStr);
    req.end();
  });
}

async function run() {
  console.log('--- Testing Nuvion Transfer with Pre-Approved Counterparty 01KYA8VZY1SXAHENF5JTDAV2KG ---');
  const entityId = '01KX6JRFSQ97ARZFKBY6R31VJ7';
  const accountId = '01KX6M4ST8S4J4DBT7NJT2S5H6';
  const approvedCpId = '01KYA8VZY1SXAHENF5JTDAV2KG';

  const ref = `po_live_app_${Date.now()}`;

  const payoutPayload = {
    entity_id: entityId,
    account_id: accountId,
    source_account_id: accountId,
    counterparty_id: approvedCpId,
    amount: 15000, // 150 NGN in kobo
    currency: 'NGN',
    payment_type: 'bank-transfer',
    narration: 'PayIT Live Payout 150 NGN',
    unique_reference: ref,
    meta: {
      account_number: '8175802032',
      bank_name: 'OPay (Paycom)',
      beneficiary_name: 'IBOH IGBOZE IGBOZE'
    }
  };

  const res = await requestNuv('/transfers', 'POST', payoutPayload);
  console.log('Nuvion Transfer Result:', JSON.stringify(res, null, 2));
}

run().catch(console.error);
