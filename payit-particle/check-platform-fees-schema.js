const Database = require('better-sqlite3');
const db = new Database('./payit.db', { readonly: true });

console.log('\n=== Platform Fees Table Schema ===\n');

try {
  const schema = db.prepare("PRAGMA table_info(platform_fees)").all();
  
  console.log('Columns:');
  schema.forEach(col => {
    console.log(`  - ${col.name}: ${col.type}${col.notnull ? ' (NOT NULL)' : ''}${col.pk ? ' (PRIMARY KEY)' : ''}`);
  });
  
  // Now fetch all records
  console.log('\n=== All Platform Fees Records ===\n');
  const rows = db.prepare('SELECT * FROM platform_fees ORDER BY created_at DESC').all();
  
  if (rows.length === 0) {
    console.log('No records found');
  } else {
    console.log(`Total records: ${rows.length}\n`);
    rows.forEach((row, idx) => {
      console.log(`Record ${idx + 1}:`);
      console.log(JSON.stringify(row, null, 2));
      console.log('');
    });
  }
  
} catch (err) {
  console.error('Error:', err.message);
}

db.close();
