const db = require('../src/db');

async function run() {
  console.log('=== INSPECTING HD DEPOSITS IN SQLITE ===\n');
  const rows = db.db.prepare('SELECT * FROM hd_deposits').all();
  console.log(`Found ${rows.length} total deposit/balance log entries in SQLite:\n`);
  console.table(rows);
}

run().catch(console.error);
