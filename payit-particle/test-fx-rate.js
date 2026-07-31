#!/usr/bin/env node
require('dotenv').config();
const fxService = require('./src/fx-service');

async function test() {
  console.log('\n' + '='.repeat(80));
  console.log('✅ Testing FX Rate Service (Nuvion Integration)');
  console.log('='.repeat(80) + '\n');

  try {
    // Test async fetch
    console.log('Fetching fresh rate from Nuvion API...\n');
    const rate = await fxService.fetchNuvionRate();
    
    console.log(`✅ Nuvion FX Rate (with 0.75% margin): ₦${rate} per USDT`);
    console.log(`   (Calculation: Base × 1.0075 = ${rate})\n`);

    // Test synchronous getter
    const syncRate = fxService.getRate();
    console.log(`✅ Cached Rate (sync): ₦${syncRate} per USDT\n`);

    // Test conversion
    const usdtAmount = 1;
    const ngnAmount = fxService.convert(usdtAmount, rate, 'USDC', 'NGN');
    console.log(`✅ Conversion Test: ${usdtAmount} USDT = ₦${ngnAmount} NGN\n`);

    // Expected: rate should be higher than 1580 (with margin)
    if (rate > 1580) {
      console.log(`✅ CORRECT! Rate includes platform margin (${rate} > 1580)`);
    } else if (rate === 1580) {
      console.log(`⚠️  Rate is exactly 1580 (fallback, Nuvion endpoint may not exist)`);
    } else {
      console.log(`❌ UNEXPECTED! Rate is less than base: ${rate}`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

test();
