const Database = require('better-sqlite3');
const db = new Database('./payit.db', { readonly: true });

console.log('\n=== PLATFORM FEES COLLECTION REPORT ===\n');

// All fee records
const fees = db.prepare('SELECT fee_id, user_id, amount_usdt, fee_address, source_currency, status, created_at FROM platform_fees ORDER BY created_at DESC').all();

if (fees.length === 0) {
  console.log('❌ NO FEES RECORDED YET\n');
} else {
  console.log(`✅ TOTAL FEES RECORDED: ${fees.length}\n`);
  console.log('Individual Fee Records:\n');
  
  fees.forEach((fee, idx) => {
    const date = new Date(fee.created_at).toLocaleString();
    console.log(`${idx + 1}. Fee ID: ${fee.fee_id}`);
    console.log(`   User: ${fee.user_id}`);
    console.log(`   Amount (USDT): $${fee.amount_usdt}`);
    console.log(`   Source Currency: ${fee.source_currency}`);
    console.log(`   Fee Address: ${fee.fee_address}`);
    console.log(`   Status: ${fee.status}`);
    console.log(`   Recorded At: ${date}\n`);
  });
}

// Summary statistics
console.log('=== SUMMARY STATISTICS ===\n');
const summary = db.prepare('SELECT COUNT(*) as count, SUM(amount_usdt) as total_usdt FROM platform_fees').get();
console.log(`Total Fees Recorded: ${summary.count}`);
console.log(`Total Amount Collected: $${summary.total_usdt || 0} USDT\n`);

// Group by address
console.log('=== FEES BY WALLET ADDRESS ===\n');
const byAddress = db.prepare('SELECT fee_address, COUNT(*) as count, SUM(amount_usdt) as total FROM platform_fees GROUP BY fee_address').all();
byAddress.forEach(addr => {
  console.log(`Address: ${addr.fee_address}`);
  console.log(`  Records: ${addr.count}`);
  console.log(`  Total: $${addr.total} USDT\n`);
});

db.close();
