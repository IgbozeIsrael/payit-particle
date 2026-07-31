require('dotenv').config();
const { Client } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');

const sqliteDbPath = path.resolve(__dirname, '../payit.db');
const sqliteDb = new Database(sqliteDbPath);

const pgConnectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_f2s6eZyWtNlD@ep-gentle-haze-ayvf6cqz-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function migrateToNeonPostgres() {
  console.log('[Neon Postgres Migration] Connecting to Neon Cloud Database...');
  const client = new Client({
    connectionString: pgConnectionString,
    ssl: { rejectUnauthorized: false }
  });
  client.on('error', (err) => console.warn('[Neon Socket Warning]:', err.message));
  await client.connect();

  try {
    console.log('[Neon Postgres Migration] Creating PostgreSQL schema...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        telegram_id TEXT PRIMARY KEY,
        user_id TEXT,
        mobile_auth_id TEXT,
        personal_smart_account TEXT NOT NULL,
        business_smart_account TEXT NOT NULL,
        auth_provider TEXT,
        active_context TEXT DEFAULT 'personal',
        first_name TEXT,
        last_name TEXT,
        business_name TEXT,
        business_email TEXT,
        email TEXT,
        phone TEXT,
        is_verified INTEGER DEFAULT 0,
        personal_kyc_status TEXT DEFAULT 'incomplete',
        business_kyb_status TEXT DEFAULT 'incomplete',
        pin_hash TEXT,
        owner_address TEXT,
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS profiles (
        profile_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        universal_account_address TEXT,
        name TEXT DEFAULT 'PayIT Profile',
        email TEXT,
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS virtual_receiving_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        nuvion_account_id TEXT,
        nuvion_account_no TEXT,
        bank_name TEXT,
        beneficiary_name TEXT,
        purpose TEXT NOT NULL,
        balance NUMERIC DEFAULT 0,
        currency TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        created_at BIGINT
      );
    `);

    console.log('[Neon Postgres Migration] Fast batch syncing users...');
    const users = sqliteDb.prepare('SELECT * FROM users').all();
    const userValues = [];
    const userParams = [];
    let pIdx = 1;

    for (const u of users) {
      userValues.push(`($${pIdx},$${pIdx+1},$${pIdx+2},$${pIdx+3},$${pIdx+4},$${pIdx+5},$${pIdx+6},$${pIdx+7},$${pIdx+8},$${pIdx+9},$${pIdx+10},$${pIdx+11},$${pIdx+12},$${pIdx+13},$${pIdx+14},$${pIdx+15},$${pIdx+16},$${pIdx+17},$${pIdx+18})`);
      userParams.push(
        u.telegram_id, u.user_id, u.mobile_auth_id, u.personal_smart_account, u.business_smart_account,
        u.auth_provider, u.active_context, u.first_name, u.last_name, u.business_name, u.business_email,
        u.email, u.phone, u.is_verified || 0, u.personal_kyc_status || 'incomplete', u.business_kyb_status || 'incomplete',
        u.pin_hash, u.owner_address, u.created_at || Date.now()
      );
      pIdx += 19;
    }

    if (userValues.length > 0) {
      await client.query(`
        INSERT INTO users (
          telegram_id, user_id, mobile_auth_id, personal_smart_account, business_smart_account,
          auth_provider, active_context, first_name, last_name, business_name, business_email,
          email, phone, is_verified, personal_kyc_status, business_kyb_status, pin_hash, owner_address, created_at
        ) VALUES ${userValues.join(', ')}
        ON CONFLICT (telegram_id) DO UPDATE SET
          is_verified = EXCLUDED.is_verified,
          personal_kyc_status = EXCLUDED.personal_kyc_status,
          pin_hash = EXCLUDED.pin_hash
      `, userParams);
    }

    console.log('[Neon Postgres Migration] Fast batch syncing profiles...');
    const profiles = sqliteDb.prepare('SELECT * FROM profiles').all();
    const profileValues = [];
    const profileParams = [];
    let profIdx = 1;

    for (const p of profiles) {
      profileValues.push(`($${profIdx},$${profIdx+1},$${profIdx+2},$${profIdx+3},$${profIdx+4},$${profIdx+5},$${profIdx+6})`);
      profileParams.push(p.profile_id, p.user_id, p.type, p.universal_account_address || '', p.name || 'Personal Profile', p.email, p.created_at || Date.now());
      profIdx += 7;
    }

    if (profileValues.length > 0) {
      await client.query(`
        INSERT INTO profiles (profile_id, user_id, type, universal_account_address, name, email, created_at)
        VALUES ${profileValues.join(', ')}
        ON CONFLICT (profile_id) DO NOTHING
      `, profileParams);
    }

    console.log('[Neon Postgres Migration] Fast batch syncing virtual accounts...');
    const accounts = sqliteDb.prepare('SELECT * FROM accounts').all();
    const accValues = [];
    const accParams = [];
    let accIdx = 1;

    for (const a of accounts) {
      accValues.push(`($${accIdx},$${accIdx+1},$${accIdx+2},$${accIdx+3},$${accIdx+4},$${accIdx+5},$${accIdx+6},$${accIdx+7},$${accIdx+8},$${accIdx+9},$${accIdx+10})`);
      accParams.push(
        a.account_id || `acc_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        a.telegram_id || a.user_id || 'system_account',
        a.nuvion_account_id || null,
        a.account_number || a.nuvion_account_no,
        a.bank_name || 'Flutterwave MFB / Nuvion Partner Bank',
        a.beneficiary_name || 'PayIT Account',
        a.purpose || a.currency || 'NGN',
        a.balance || 0,
        a.currency || a.purpose || 'NGN',
        a.status || 'active',
        a.created_at || Date.now()
      );
      accIdx += 11;
    }

    if (accValues.length > 0) {
      await client.query(`
        INSERT INTO virtual_receiving_accounts (
          id, user_id, nuvion_account_id, nuvion_account_no, bank_name, beneficiary_name, purpose, balance, currency, status, created_at
        ) VALUES ${accValues.join(', ')}
        ON CONFLICT (id) DO NOTHING
      `, accParams);
    }

    const totalUsers = await client.query('SELECT COUNT(*) FROM users');
    const totalProfiles = await client.query('SELECT COUNT(*) FROM profiles');
    const totalAccounts = await client.query('SELECT COUNT(*) FROM virtual_receiving_accounts');

    console.log('======================================================');
    console.log('🎉 NEON SERVERLESS POSTGRES MIGRATION COMPLETE!');
    console.log(`  • Total Users in Neon Postgres: ${totalUsers.rows[0].count}`);
    console.log(`  • Total Profiles in Neon Postgres: ${totalProfiles.rows[0].count}`);
    console.log(`  • Total Virtual Accounts in Neon Postgres: ${totalAccounts.rows[0].count}`);
    console.log('======================================================');
  } catch (err) {
    console.error('[Neon Postgres Migration Error]:', err.message);
  } finally {
    await client.end();
  }
}

migrateToNeonPostgres();
