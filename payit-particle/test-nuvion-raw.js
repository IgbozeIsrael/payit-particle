#!/usr/bin/env node
require('dotenv').config();
const nuvionService = require('./src/nuvion-service');

async function test() {
  console.log('\n🔍 Testing Nuvion /accounts endpoint\n');

  try {
    console.log('Calling nuvionService.requestNuvionWithFallback("/accounts", "GET")...\n');
    const res = await nuvionService.requestNuvionWithFallback('/accounts', 'GET');
    
    console.log('Response structure:');
    console.log(JSON.stringify(res, null, 2).slice(0, 2000));
    
    const accList = res?.data?.data || res?.data || [];
    console.log(`\n\nTotal accounts: ${accList.length}`);
    
    const ngnAccounts = accList.filter(a => a.currency === 'NGN');
    console.log(`NGN accounts: ${ngnAccounts.length}\n`);
    
    ngnAccounts.slice(0, 3).forEach((acc, idx) => {
      console.log(`\nAccount ${idx + 1}:`);
      console.log(`  id: ${acc.id}`);
      console.log(`  account_number: ${acc.account_number}`);
      console.log(`  nuvion_ban: ${acc.nuvion_ban}`);
      console.log(`  balance: ${JSON.stringify(acc.balance)}`);
      console.log(`  status: ${acc.status}`);
      console.log(`  meta: ${JSON.stringify(acc.meta)}`);
      console.log(`  currency: ${acc.currency}`);
    });

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

test();
