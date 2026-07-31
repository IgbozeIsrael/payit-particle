const Database = require('better-sqlite3');
const db = new Database('./payit.db', { readonly: true });

console.log('\n=== Platform Fees (Last 20 Records) ===\n');

try {
  const fees = db.prepare('SELECT * FROM platform_fees ORDER BY created_at DESC LIMIT 20').all();
  
  if (fees.length === 0) {
    console.log('❌ No platform fees found in database');
  } else {
    console.log(`✅ Found ${fees.length} platform fee records:\n`);
    fees.forEach((fee, index) => {
      console.log(`${index + 1}. ID: ${fee.id}`);
      console.log(`   Amount: ${fee.amount} ${fee.currency}`);
      console.log(`   Transaction: ${fee.transaction_id}`);
      console.log(`   User: ${fee.user_id}`);
      console.log(`   Created: ${fee.created_at}`);
      console.log('');
    });
  }
  
  // Summary stats
  const stats = db.prepare('SELECT COUNT(*) as total, SUM(amount) as total_amount, currency FROM platform_fees GROUP BY currency').all();
  console.log('\n=== Summary Stats ===\n');
  stats.forEach(stat => {
    console.log(`${stat.currency}: ${stat.total} fees, Total: ${stat.total_amount}`);
  });
  
} catch (err) {
  console.error('Error querying platform_fees:', err.message);
  
  // Try to list tables
  console.log('\n=== Available Tables ===\n');
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    tables.forEach(t => console.log(`- ${t.name}`));
  } catch (e) {
    console.error('Could not list tables:', e.message);
  }
}

db.close();
