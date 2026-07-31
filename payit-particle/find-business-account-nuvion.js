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
  console.log('Looking for Nuvion account with number 9134148532...\n');

  // Get all accounts with pagination
  let allAccounts = [];
  let cursor = null;
  let hasMore = true;

  while (hasMore) {
    const path = cursor ? `/accounts?next_cursor=${cursor}` : '/accounts';
    const resp = await requestNuv(path, 'GET');
    const data = resp.data?.data || {};
    const accounts = data.data || [];
    
    console.log(`  Retrieved ${accounts.length} accounts${cursor ? ` (cursor: ${cursor})` : ''}`);
    allAccounts = allAccounts.concat(accounts);
    
    // Check pagination
    if (data.meta?.pagination?.has_next && data.meta?.pagination?.next_cursor) {
      cursor = data.meta.pagination.next_cursor;
    } else {
      hasMore = false;
    }
  }

  console.log(`\nTotal accounts retrieved: ${allAccounts.length}\n`);

  // Find the account
  const foundAccount = allAccounts.find(a => a.nuvion_ban === '9134148532');
  
  if (foundAccount) {
    console.log('✅ FOUND Account 9134148532:\n');
    console.log(`Account ID: ${foundAccount.id}`);
    console.log(`Entity ID: ${foundAccount.entity_id}`);
    console.log(`Currency: ${foundAccount.currency}`);
    console.log(`Display Name: ${foundAccount.display_name}`);
    console.log(`Type: ${foundAccount.type}`);
    console.log(`Status: ${foundAccount.status}`);
    console.log(`Meta: ${JSON.stringify(foundAccount.meta, null, 2)}`);
    console.log();
  } else {
    console.log('❌ Account 9134148532 NOT FOUND\n');
    console.log('Searching for accounts with "business" or "9134" in display name:\n');
    const similar = allAccounts.filter(a => 
      (a.display_name && (a.display_name.toLowerCase().includes('business') || a.display_name.includes('9134'))) ||
      (a.meta?.context === 'business')
    );
    
    if (similar.length > 0) {
      similar.forEach((acc, i) => {
        console.log(`[${i+1}] ${acc.nuvion_ban} - ${acc.display_name}`);
        console.log(`    Entity: ${acc.entity_id}`);
        console.log(`    Context: ${acc.meta?.context || '(none)'}`);
      });
    } else {
      console.log('No similar accounts found');
    }
  }
}

run().catch(console.error);
