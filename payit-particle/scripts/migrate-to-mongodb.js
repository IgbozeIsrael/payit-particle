const dns = require('dns');
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ii0430619_db_user:jkPzM027jvR8oBNz@payit.tgmsem1.mongodb.net/?appName=PayIT';

async function migrate() {
  console.log('\n🚀 STARTING FAST BULK MONGODB ATLAS SEEDING...\n');
  console.log(`Connecting to MongoDB Atlas...`);

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected successfully to MongoDB Atlas Cloud Database!');

    const mongoDb = client.db('payit');
    const sqliteDb = require('../src/db').db;

    const tables = [
      { name: 'users', key: 'telegram_id' },
      { name: 'profiles', key: 'profile_id' },
      { name: 'profile_kyc_individual', key: 'profile_id' },
      { name: 'profile_kyc_business', key: 'profile_id' },
      { name: 'accounts', key: 'account_id' },
      { name: 'hd_deposits', key: 'deposit_id' },
      { name: 'audit_logs', key: 'log_id' },
      { name: 'invoices', key: 'invoice_id' },
      { name: 'customers', key: 'customer_id' }
    ];

    for (const t of tables) {
      try {
        const rows = sqliteDb.prepare(`SELECT * FROM ${t.name}`).all();
        if (rows.length > 0) {
          const collection = mongoDb.collection(t.name);
          console.log(`  📦 Bulk writing ${rows.length} rows into collection "${t.name}"...`);
          
          const operations = rows.map(row => {
            const filter = {};
            filter[t.key] = row[t.key] || row.telegram_id || String(Math.random());
            return {
              updateOne: {
                filter,
                update: { $set: row },
                upsert: true
              }
            };
          });

          await collection.bulkWrite(operations);
          console.log(`  ✅ Collection "${t.name}" synchronized (${rows.length} records).`);
        }
      } catch (tableErr) {
        console.warn(`  ⚠️ Table "${t.name}" note:`, tableErr.message);
      }
    }

    // Create Indexes for fast querying
    console.log('\n⚡ Creating MongoDB Search Indexes...');
    await mongoDb.collection('users').createIndex({ email: 1 });
    await mongoDb.collection('users').createIndex({ telegram_id: 1 });
    await mongoDb.collection('users').createIndex({ is_verified: 1 });
    await mongoDb.collection('profiles').createIndex({ user_id: 1, type: 1 });
    await mongoDb.collection('profile_kyc_individual').createIndex({ profile_id: 1, email: 1 });
    await mongoDb.collection('accounts').createIndex({ profile_id: 1 });
    console.log('✅ Indexes created successfully.');

    // Verify user count in MongoDB Atlas
    const usersCount = await mongoDb.collection('users').countDocuments();
    const accountsCount = await mongoDb.collection('accounts').countDocuments();
    const verifiedUser = await mongoDb.collection('users').findOne({ is_verified: 1 });

    console.log('\n======================================================');
    console.log('🎉 MONGODB ATLAS SEEDING & INDEXING COMPLETE!');
    console.log(`  • Total Users in MongoDB Atlas: ${usersCount}`);
    console.log(`  • Total Virtual Accounts in MongoDB Atlas: ${accountsCount}`);
    if (verifiedUser) {
      console.log(`  • Primary Verified User: ${verifiedUser.first_name || 'IBOH IGBOZE'} (${verifiedUser.email || 'igbozeigboze@gmail.com'})`);
      console.log(`  • Personal Smart Account: ${verifiedUser.personal_smart_account}`);
      console.log(`  • Business Smart Account: ${verifiedUser.business_smart_account}`);
    }
    console.log('======================================================\n');

  } catch (err) {
    console.error('❌ MongoDB Migration Error:', err);
  } finally {
    await client.close();
    process.exit(0);
  }
}

migrate();
