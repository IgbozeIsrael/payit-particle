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
  console.log('Querying for business account NGN 9134148532...\n');
  
  // Query by account number
  const resp1 = await requestNuv('/accounts?nuvion_ban=9134148532', 'GET');
  if (resp1.data?.data?.data) {
    console.log('Found via ?nuvion_ban:');
    const acc = resp1.data.data.data[0];
    console.log(`Entity ID: ${acc.entity_id}`);
    console.log(`Account ID: ${acc.id}`);
    console.log(`Display Name: ${acc.display_name}`);
    console.log(`Meta: ${JSON.stringify(acc.meta)}\n`);
  } else if (resp1.data?.data) {
    console.log('Response data.data:');
    console.log(JSON.stringify(resp1.data.data, null, 2));
  } else {
    console.log('No specific account found');
  }

  // Also query all accounts again and filter
  console.log('\n\nQuerying all accounts and looking for business context...\n');
  const resp2 = await requestNuv('/accounts', 'GET');
  const allAccounts = resp2.data?.data?.data || resp2.data?.data || [];
  
  console.log(`Total accounts: ${allAccounts.length}\n`);
  
  const businessAccounts = allAccounts.filter(a => 
    (a.meta?.context === 'business') || 
    (a.nuvion_ban === '9134148532') ||
    (a.display_name && a.display_name.toLowerCase().includes('tech'))
  );
  
  console.log(`Business-context accounts: ${businessAccounts.length}\n`);
  businessAccounts.forEach((acc, i) => {
    console.log(`[${i+1}] ${acc.nuvion_ban || acc.id}`);
    console.log(`    Entity ID: ${acc.entity_id}`);
    console.log(`    Display: ${acc.display_name}`);
    console.log(`    Context: ${acc.meta?.context || '(none)'}\n`);
  });
}

run().catch(console.error);
