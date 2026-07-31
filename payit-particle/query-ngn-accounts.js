#!/usr/bin/env node
require('dotenv').config();
const https = require('https');

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
  // Get all accounts and filter by NGN
  const resp = await requestNuv('/accounts', 'GET');
  const allAccounts = resp.data?.data?.data || resp.data?.data || [];
  
  const ngnAccounts = allAccounts.filter(a => a.currency === 'NGN');
  console.log('All NGN Accounts:\n');
  ngnAccounts.forEach((acc, i) => {
    console.log(`[${i+1}] ${acc.nuvion_ban}`);
    console.log(`    Entity: ${acc.entity_id}`);
    console.log(`    Display: ${acc.display_name}`);
    console.log(`    Meta context: ${acc.meta?.context || '(none)'}`);
    console.log(`    Platform user: ${acc.meta?.platform_user_id || '(none)'}`);
    console.log();
  });

  // List unique entities from NGN accounts
  const uniqueEntities = [...new Set(ngnAccounts.map(a => a.entity_id))];
  console.log(`\nUnique Entity IDs in NGN accounts: ${uniqueEntities.length}`);
  uniqueEntities.forEach((eid, i) => {
    const accsForEntity = ngnAccounts.filter(a => a.entity_id === eid);
    console.log(`\n[${i+1}] Entity ${eid}`);
    console.log(`    Accounts: ${accsForEntity.length}`);
    accsForEntity.forEach(acc => {
      console.log(`      - ${acc.nuvion_ban}: ${acc.display_name}`);
    });
  });
}

run().catch(console.error);
