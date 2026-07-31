#!/usr/bin/env node
const fs = require('fs');

// Check if response.json exists
if (fs.existsSync('./response.json')) {
  const data = JSON.parse(fs.readFileSync('./response.json', 'utf-8'));
  
  console.log('Searching response.json for account 9134148532...\n');
  
  const accounts = Array.isArray(data) ? data : (data.data?.data || data.data || []);
  
  const found = accounts.find(a => a.nuvion_ban === '9134148532');
  if (found) {
    console.log('✅ FOUND!\n');
    console.log(JSON.stringify(found, null, 2));
  } else {
    console.log('Not found. All nuvion_ban values found:');
    const bans = accounts.map(a => a.nuvion_ban).filter(Boolean);
    bans.forEach(ban => console.log(`  ${ban}`));
  }
} else {
  console.log('response.json not found');
}
