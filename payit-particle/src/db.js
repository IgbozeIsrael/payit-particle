require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  const isDeployedEnv = process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_STATIC_URL || process.env.NETLIFY || process.env.VERCEL);
  if (isDeployedEnv) {
    console.error('FATAL: NEON_DATABASE_URL / DATABASE_URL is missing in environment!');
    throw new Error('FATAL CONFIG ERROR: NEON_DATABASE_URL or DATABASE_URL environment variable missing!');
  } else {
    console.warn('[DB-PG] Warning: NEON_DATABASE_URL not set in local environment.');
  }
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.warn('[DB-PG Pool Error]:', err.message);
});


async function initTables() {
  if (!connectionString) return;
  try {
    await query(`
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
        business_logo TEXT,
        business_address TEXT,
        email TEXT,
        phone TEXT,
        is_verified INTEGER DEFAULT 0,
        personal_kyc_status TEXT DEFAULT 'incomplete',
        business_kyb_status TEXT DEFAULT 'incomplete',
        pin_hash TEXT,
        owner_address TEXT,
        auto_save_percent NUMERIC DEFAULT 0,
        auto_save_type TEXT DEFAULT 'lock',
        auto_save_duration_days INTEGER DEFAULT 30,
        low_balance_threshold NUMERIC DEFAULT 0,
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS profiles (
        profile_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        universal_account_address TEXT,
        name TEXT DEFAULT 'PayIT Profile',
        email TEXT,
        kyb_status TEXT DEFAULT 'starter',
        verification_status TEXT DEFAULT 'not_started',
        rejection_reasons TEXT,
        pending_requirements TEXT,
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS profile_kyc_individual (
        profile_id TEXT PRIMARY KEY,
        first_name TEXT,
        last_name TEXT,
        phone TEXT,
        dob TEXT,
        gender TEXT,
        bvn TEXT,
        nin TEXT,
        address TEXT,
        city TEXT,
        state TEXT,
        postal_code TEXT,
        country TEXT DEFAULT 'NG',
        id_card_url TEXT,
        utility_bill_url TEXT,
        selfie_url TEXT,
        verified_at BIGINT,
        rejection_reason TEXT
      );

      CREATE TABLE IF NOT EXISTS profile_kyc_business (
        profile_id TEXT PRIMARY KEY,
        business_name TEXT,
        rc_number TEXT,
        tin TEXT,
        business_type TEXT,
        industry TEXT,
        address TEXT,
        city TEXT,
        state TEXT,
        cac_doc_url TEXT,
        verified_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS virtual_receiving_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
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

      CREATE TABLE IF NOT EXISTS accounts (
        account_id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        type TEXT DEFAULT 'fiat',
        provider TEXT DEFAULT 'nuvion',
        account_number TEXT,
        nuvion_account_no TEXT,
        nuvion_account_id TEXT,
        bank_name TEXT,
        beneficiary_name TEXT,
        currency TEXT DEFAULT 'NGN',
        purpose TEXT DEFAULT 'NGN',
        status TEXT DEFAULT 'active',
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS cards (
        card_id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        nuvion_account_id TEXT,
        buffer_threshold NUMERIC DEFAULT 5.0,
        refill_amount NUMERIC DEFAULT 20.0,
        card_type TEXT DEFAULT 'virtual',
        currency TEXT DEFAULT 'USD',
        last4 TEXT,
        card_number TEXT,
        cvv TEXT,
        expiry TEXT,
        brand TEXT DEFAULT 'Visa',
        status TEXT DEFAULT 'active',
        name_on_card TEXT,
        context TEXT DEFAULT 'personal',
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS card_issuance_fees (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        card_id TEXT,
        fee_amount NUMERIC NOT NULL,
        currency TEXT DEFAULT 'USD',
        status TEXT DEFAULT 'paid',
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS kyc_documents (
        document_id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        nuvion_document_id TEXT,
        doc_key TEXT NOT NULL,
        status TEXT DEFAULT 'uploaded',
        uploaded_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS business_officers (
        officer_id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        nin TEXT,
        bvn TEXT,
        role TEXT,
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS invoices (
        invoice_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        recipient TEXT,
        amount NUMERIC NOT NULL,
        currency TEXT NOT NULL,
        due_date TEXT,
        deposit_address TEXT,
        payment_link_token TEXT,
        client_name TEXT,
        client_email TEXT,
        item_description TEXT,
        tax_amount NUMERIC DEFAULT 0,
        total_amount NUMERIC,
        virtual_account_no TEXT,
        notification_sent INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        settlement_tx_hash TEXT,
        settlement_token TEXT,
        deposit_chain TEXT,
        deposit_token TEXT,
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS transactions (
        tx_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        sender TEXT,
        recipient TEXT,
        amount NUMERIC NOT NULL,
        token TEXT NOT NULL,
        tx_hash TEXT,
        status TEXT DEFAULT 'completed',
        chain TEXT DEFAULT 'arbitrum_sepolia',
        timestamp BIGINT
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        log_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        created_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS customers (
        customer_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        notes TEXT,
        invoice_count INTEGER DEFAULT 0,
        magic_issuer TEXT,
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS split_bills (
        split_id TEXT PRIMARY KEY,
        creator_id TEXT NOT NULL,
        total_amount NUMERIC NOT NULL,
        currency TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS split_participants (
        id SERIAL PRIMARY KEY,
        split_id TEXT NOT NULL,
        telegram_username TEXT NOT NULL,
        amount_owed NUMERIC NOT NULL,
        status TEXT DEFAULT 'pending'
      );

      CREATE TABLE IF NOT EXISTS hd_deposits (
        deposit_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expected_amount NUMERIC NOT NULL,
        currency TEXT NOT NULL,
        deposit_address TEXT NOT NULL,
        deposit_wallet_private_key TEXT,
        virtual_account_no TEXT,
        status TEXT DEFAULT 'pending',
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS savings_locks (
        lock_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        currency TEXT NOT NULL,
        interest_rate NUMERIC DEFAULT 0.08,
        start_time BIGINT NOT NULL,
        duration_days INTEGER NOT NULL,
        status TEXT DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS savings_goals (
        goal_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        target_amount NUMERIC NOT NULL,
        current_amount NUMERIC DEFAULT 0,
        currency TEXT DEFAULT 'USDC',
        status TEXT DEFAULT 'active',
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS payroll_batches (
        batch_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        total_amount NUMERIC NOT NULL,
        currency TEXT NOT NULL,
        recipient_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        auto_execute INTEGER DEFAULT 0,
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS payroll_lines (
        line_id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        employee_name TEXT,
        account_number TEXT,
        bank_code TEXT,
        amount NUMERIC NOT NULL,
        status TEXT DEFAULT 'pending'
      );

      CREATE TABLE IF NOT EXISTS payroll_approvals (
        approval_id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        approver_id TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS platform_fees (
        fee_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tx_id TEXT,
        amount NUMERIC NOT NULL,
        currency TEXT NOT NULL,
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS auto_save_events (
        event_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        source_tx_id TEXT,
        saved_amount NUMERIC NOT NULL,
        lock_id TEXT,
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS recurring_invoices (
        recurring_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        client_name TEXT,
        client_email TEXT,
        amount NUMERIC NOT NULL,
        currency TEXT NOT NULL,
        frequency TEXT NOT NULL,
        next_run_at BIGINT,
        status TEXT DEFAULT 'active',
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS expenses (
        expense_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        category TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        currency TEXT NOT NULL,
        description TEXT,
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS invoice_reminders (
        reminder_id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        remind_at BIGINT NOT NULL,
        status TEXT DEFAULT 'pending'
      );

      CREATE TABLE IF NOT EXISTS fx_rate_locks (
        lock_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        from_currency TEXT NOT NULL,
        to_currency TEXT NOT NULL,
        rate NUMERIC NOT NULL,
        expires_at BIGINT NOT NULL,
        status TEXT DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS session_keys (
        key_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        public_key TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        usage_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS passkey_credentials (
        credential_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        public_key TEXT NOT NULL,
        sign_count INTEGER DEFAULT 0,
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS operations (
        operation_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        transaction_id TEXT,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS referrals (
        referral_id TEXT PRIMARY KEY,
        referrer_id TEXT NOT NULL,
        referred_id TEXT NOT NULL,
        referral_code TEXT NOT NULL,
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS referral_earnings (
        earning_id TEXT PRIMARY KEY,
        referrer_id TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        currency TEXT NOT NULL,
        status TEXT DEFAULT 'unclaimed',
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS user_points (
        user_id TEXT PRIMARY KEY,
        points_balance INTEGER DEFAULT 0,
        total_earned INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS point_redemptions (
        redemption_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        points_spent INTEGER NOT NULL,
        reward_description TEXT,
        created_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS sync_codes (
        code TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        used INTEGER DEFAULT 0
      );
    `);
    console.log('[DB-PG] All 22 Neon Postgres tables verified/initialized.');
  } catch (err) {
    console.warn('[DB-PG Schema Initialization Notice]:', err.message);
  }
}

initTables();


// Helper for standard query execution
async function query(text, params) {
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (err) {
    console.error('[DB-PG Query Error]:', err.message, '| Query:', text);
    throw err;
  }
}

// Pure helper function
function getFormattedVerifiedName(user, profile) {
  if (!user && !profile) return null;
  const kycName = profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : null;
  const bizName = user?.business_name || profile?.business_name || null;
  if (bizName) return `${bizName.toUpperCase()} / PayIT`;
  if (kycName) return `${kycName} / PayIT`;
  if (user?.first_name) return `${user.first_name} ${user.last_name || ''}`.trim();
  return null;
}

function _formatInvoiceRow(r) {
  if (!r) return null;
  return {
    ...r,
    amount: Number(r.amount || 0),
    taxAmount: Number(r.tax_amount || 0),
    totalAmount: Number(r.total_amount || r.amount || 0)
  };
}

// ── User & Profile Async Query Functions ────────────────────────────────────

async function getUser(identifier) {
  if (!identifier) return null;
  const cleanId = String(identifier).trim();
  const cleanEmail = cleanId.toLowerCase();

  const res = await query(`
    SELECT * FROM users
    WHERE telegram_id = $1
       OR user_id = $1
       OR mobile_auth_id = $1
       OR owner_address = $1
       OR personal_smart_account = $1
       OR business_smart_account = $1
       OR (LOWER(COALESCE(business_email, '')) = $2 AND $2 != '')
       OR (LOWER(COALESCE(email, '')) = $2 AND $2 != '')
    ORDER BY (CASE WHEN is_verified = 1 THEN 0 ELSE 1 END) ASC, created_at ASC
    LIMIT 1
  `, [cleanId, cleanEmail]);

  return res.rows[0] || null;
}

async function getProfile(profileId) {
  if (!profileId) return null;
  const res = await query('SELECT * FROM profiles WHERE profile_id = $1 LIMIT 1', [profileId]);
  return res.rows[0] || null;
}

async function getProfilesForUser(userId) {
  if (!userId) return [];
  const res = await query('SELECT * FROM profiles WHERE user_id = $1 ORDER BY created_at ASC', [userId]);
  return res.rows;
}

async function getProfileByType(userId, type) {
  if (!userId || !type) return null;
  const res = await query('SELECT * FROM profiles WHERE user_id = $1 AND type = $2 LIMIT 1', [userId, type]);
  return res.rows[0] || null;
}

async function createUser(telegramId, personalSmartAccount, businessSmartAccount, authProvider = 'telegram') {
  if (!telegramId) return null;
  const now = Date.now();
  await query(`
    INSERT INTO users (telegram_id, user_id, personal_smart_account, business_smart_account, auth_provider, active_context, created_at)
    VALUES ($1, $1, $2, $3, $4, 'personal', $5)
    ON CONFLICT (telegram_id) DO UPDATE SET
      personal_smart_account = EXCLUDED.personal_smart_account,
      business_smart_account = EXCLUDED.business_smart_account
  `, [telegramId, personalSmartAccount, businessSmartAccount, authProvider, now]);

  await query(`
    INSERT INTO profiles (profile_id, user_id, type, universal_account_address, name, created_at)
    VALUES ($1, $2, 'personal', $3, 'Personal Profile', $4)
    ON CONFLICT (profile_id) DO NOTHING
  `, [`prof_p_${telegramId}`, telegramId, personalSmartAccount, now]);

  await query(`
    INSERT INTO profiles (profile_id, user_id, type, universal_account_address, name, created_at)
    VALUES ($1, $2, 'business', $3, 'Business Profile', $4)
    ON CONFLICT (profile_id) DO NOTHING
  `, [`prof_b_${telegramId}`, telegramId, businessSmartAccount, now]);

  return getUser(telegramId);
}

async function updateUserContext(userId, activeContext) {
  if (!userId) return;
  await query('UPDATE users SET active_context = $1 WHERE telegram_id = $2 OR user_id = $2', [activeContext, userId]);
}

async function updateOwnerAddress(userId, ownerAddress) {
  if (!userId) return;
  await query('UPDATE users SET owner_address = $1 WHERE telegram_id = $2 OR user_id = $2', [ownerAddress, userId]);
}

async function updateUserPin(userId, pinHash) {
  if (!userId) return;
  await query('UPDATE users SET pin_hash = $1 WHERE telegram_id = $2 OR user_id = $2 OR email = $2 OR business_email = $2', [pinHash, userId]);
}

async function updateBusinessProfile(userId, data) {
  if (!userId) return;
  const { business_name, business_email, phone } = data || {};
  await query(`
    UPDATE users SET
      business_name = COALESCE($1, business_name),
      business_email = COALESCE($2, business_email),
      phone = COALESCE($3, phone)
    WHERE telegram_id = $4 OR user_id = $4
  `, [business_name, business_email, phone, userId]);
}

async function saveBusinessProfile(profileId, userId, data) {
  if (!profileId || !userId) return;
  const now = Date.now();
  const { business_name, rc_number, tin, business_type, industry, address, city, state } = data || {};
  await query(`
    INSERT INTO profile_kyc_business (profile_id, business_name, rc_number, tin, business_type, industry, address, city, state, verified_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (profile_id) DO UPDATE SET
      business_name = EXCLUDED.business_name,
      rc_number = EXCLUDED.rc_number,
      tin = EXCLUDED.tin,
      business_type = EXCLUDED.business_type,
      industry = EXCLUDED.industry,
      address = EXCLUDED.address,
      city = EXCLUDED.city,
      state = EXCLUDED.state,
      verified_at = EXCLUDED.verified_at
  `, [profileId, business_name, rc_number, tin, business_type, industry, address, city, state, now]);
}

async function updateFullBusinessProfile(profileId, data) {
  if (!profileId) return;
  return saveBusinessProfile(profileId, data?.user_id || profileId, data);
}

async function updateBusinessKybCac(profileId, rcNumber, tin, cacUrl) {
  if (!profileId) return;
  await query(`
    UPDATE profile_kyc_business SET
      rc_number = COALESCE($1, rc_number),
      tin = COALESCE($2, tin),
      cac_doc_url = COALESCE($3, cac_doc_url)
    WHERE profile_id = $4
  `, [rcNumber, tin, cacUrl, profileId]);
}

async function getProfileKybStatus(profileId) {
  if (!profileId) return null;
  const res = await query('SELECT * FROM profile_kyc_business WHERE profile_id = $1 LIMIT 1', [profileId]);
  return res.rows[0] || null;
}

async function validateBusinessKyb(profileId) {
  if (!profileId) return;
  const now = Date.now();
  await query('UPDATE profile_kyc_business SET verified_at = $1 WHERE profile_id = $2', [now, profileId]);
  const prof = await getProfile(profileId);
  if (prof?.user_id) {
    await query("UPDATE users SET business_kyb_status = 'approved' WHERE telegram_id = $1 OR user_id = $1", [prof.user_id]);
  }
}

async function findExistingKycUser(idNumber, profileIdToExclude) {
  if (!idNumber) return null;
  const res = await query(`
    SELECT * FROM profile_kyc_individual
    WHERE (bvn = $1 OR nin = $1)
      AND ($2::text IS NULL OR profile_id != $2)
    LIMIT 1
  `, [idNumber, profileIdToExclude || null]);
  return res.rows[0] || null;
}

async function findExistingKybUser(rcNumber, profileIdToExclude) {
  if (!rcNumber) return null;
  const res = await query(`
    SELECT * FROM profile_kyc_business
    WHERE rc_number = $1
      AND ($2::text IS NULL OR profile_id != $2)
    LIMIT 1
  `, [rcNumber, profileIdToExclude || null]);
  return res.rows[0] || null;
}

async function updateUserNin(userId, nin) {
  if (!userId || !nin) return;
  await query('UPDATE profile_kyc_individual SET nin = $1 WHERE profile_id = $2 OR profile_id = $3', [nin, `prof_p_${userId}`, userId]);
}

async function getUnverifiedTelegramUsers() {
  const res = await query("SELECT * FROM users WHERE is_verified = 0 OR personal_kyc_status = 'incomplete'");
  return res.rows;
}

async function updateUserNuvionAccount(userId, nuvionAccNo) {
  if (!userId || !nuvionAccNo) return;
  await query(`
    INSERT INTO virtual_receiving_accounts (id, user_id, nuvion_account_no, bank_name, beneficiary_name, purpose, currency, created_at)
    VALUES ($1, $2, $3, 'Flutterwave MFB / Nuvion Partner Bank', 'PayIT Account', 'NGN', 'NGN', $4)
    ON CONFLICT (id) DO UPDATE SET nuvion_account_no = EXCLUDED.nuvion_account_no
  `, [`acc_ngn_${userId}`, userId, nuvionAccNo, Date.now()]);
}

async function updateUserBusinessNuvionAccount(userId, nuvionAccNo) {
  if (!userId || !nuvionAccNo) return;
  await query(`
    INSERT INTO virtual_receiving_accounts (id, user_id, nuvion_account_no, bank_name, beneficiary_name, purpose, currency, created_at)
    VALUES ($1, $2, $3, 'Flutterwave MFB / Nuvion Partner Bank', 'PayIT Business Account', 'NGN_BIZ', 'NGN', $4)
    ON CONFLICT (id) DO UPDATE SET nuvion_account_no = EXCLUDED.nuvion_account_no
  `, [`acc_ngn_biz_${userId}`, userId, nuvionAccNo, Date.now()]);
}

async function getProfileByNuvionAccount(nuvionAccNo) {
  if (!nuvionAccNo) return null;
  const res = await query('SELECT * FROM virtual_receiving_accounts WHERE nuvion_account_no = $1 LIMIT 1', [nuvionAccNo]);
  if (res.rows[0]?.user_id) {
    return getProfile(`prof_p_${res.rows[0].user_id}`);
  }
  return null;
}

async function getUserByNuvionAccount(nuvionAccNo) {
  if (!nuvionAccNo) return null;
  const res = await query('SELECT * FROM virtual_receiving_accounts WHERE nuvion_account_no = $1 LIMIT 1', [nuvionAccNo]);
  if (res.rows[0]?.user_id) {
    return getUser(res.rows[0].user_id);
  }
  return null;
}

async function getUserByMagicIssuer(issuer) {
  if (!issuer) return null;
  return getUser(issuer);
}

async function getUserByOwnerAddress(ownerAddress) {
  if (!ownerAddress) return null;
  return getUser(ownerAddress);
}

async function linkTelegramIdToUser(emailOrIssuer, telegramId) {
  if (!emailOrIssuer || !telegramId) return;
  await query(`
    UPDATE users SET telegram_id = $1 WHERE user_id = $2 OR email = $2 OR business_email = $2
  `, [telegramId, emailOrIssuer]);
}

async function createAuditLog(log) {
  if (!log) return;
  const { logId, userId, action, details } = log;
  await query(`
    INSERT INTO audit_logs (log_id, user_id, action, details, created_at)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (log_id) DO NOTHING
  `, [logId || `log_${Date.now()}`, userId || 'system', action || 'ACTION', JSON.stringify(details || {}), Date.now()]);
}

async function getAuditLogs(userId) {
  if (!userId) return [];
  const res = await query('SELECT * FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [userId]);
  return res.rows;
}

async function createNotification(notif) {
  if (!notif) return;
  const { id, userId, title, message, type } = notif;
  await query(`
    INSERT INTO audit_logs (log_id, user_id, action, details, created_at)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (log_id) DO NOTHING
  `, [id || `notif_${Date.now()}`, userId, type || 'NOTIFICATION', JSON.stringify({ title, message }), Date.now()]);
}

async function getNotifications(userId) {
  if (!userId) return [];
  const res = await query("SELECT * FROM audit_logs WHERE user_id = $1 AND action = 'NOTIFICATION' ORDER BY created_at DESC", [userId]);
  return res.rows;
}

async function getUnreadNotificationCount(userId) {
  if (!userId) return 0;
  const res = await query("SELECT COUNT(*) FROM audit_logs WHERE user_id = $1 AND action = 'NOTIFICATION'", [userId]);
  return parseInt(res.rows[0]?.count || '0', 10);
}

async function markNotificationsRead(userId) {
  if (!userId) return;
  await query("UPDATE audit_logs SET action = 'NOTIFICATION_READ' WHERE user_id = $1 AND action = 'NOTIFICATION'", [userId]);
}

// ── Invoices Async Query Functions ─────────────────────────────────────────

async function createFullInvoice({ invoiceId, userId, clientName, clientEmail, itemDescription, amount, taxAmount, totalAmount, currency, dueDate, depositAddress, virtualAccountNo, paymentLinkToken, depositChain, depositToken }) {
  if (!invoiceId || !userId) return;
  const now = Date.now();
  await query(`
    INSERT INTO invoices (
      invoice_id, user_id, recipient, amount, currency, due_date, deposit_address,
      payment_link_token, client_name, client_email, item_description, tax_amount, total_amount,
      virtual_account_no, notification_sent, created_at, deposit_chain, deposit_token
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 0, $15, $16, $17)
    ON CONFLICT (invoice_id) DO UPDATE SET
      amount = EXCLUDED.amount,
      total_amount = EXCLUDED.total_amount
  `, [
    invoiceId, userId, clientName, amount, currency, dueDate, depositAddress || null,
    paymentLinkToken || null, clientName, clientEmail || null, itemDescription || null,
    taxAmount || 0, totalAmount || amount, virtualAccountNo || null,
    now, depositChain || null, depositToken || null
  ]);
}

async function markInvoicePaid(invoiceId, txHash = null) {
  if (!invoiceId) return;
  try {
    const invRes = await query('SELECT * FROM invoices WHERE invoice_id = $1 LIMIT 1', [invoiceId]);
    const inv = invRes.rows[0];
    if (!inv) return;
    await query(`
      UPDATE invoices SET status = 'paid', notification_sent = 1, settlement_tx_hash = COALESCE($1, settlement_tx_hash) WHERE invoice_id = $2
    `, [txHash, invoiceId]);
    try {
      const notificationService = require('./notification-service');
      notificationService.notify(
        inv.user_id,
        'invoice_paid',
        'Invoice Paid! 🎉',
        `Your invoice ${inv.invoice_id} for ${inv.currency} ${inv.total_amount || inv.amount} has been paid by ${inv.recipient || inv.client_name || 'Client'}.`,
        { invoiceId: inv.invoice_id, amount: inv.total_amount || inv.amount, currency: inv.currency }
      );
    } catch (_) {}
  } catch (e) {
    console.warn('[DB-PG] markInvoicePaid notice:', e.message);
  }
}

async function getPendingInvoices() {
  try {
    const res = await query("SELECT * FROM invoices WHERE status = 'pending' ORDER BY created_at DESC");
    return res.rows;
  } catch (_) { return []; }
}

async function getInvoiceByVirtualAccount(virtualAccountNo) {
  if (!virtualAccountNo) return null;
  try {
    const res = await query("SELECT * FROM invoices WHERE virtual_account_no = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1", [virtualAccountNo]);
    return res.rows[0] ? _formatInvoiceRow(res.rows[0]) : null;
  } catch (_) { return null; }
}

async function getInvoice(invoiceId) {
  if (!invoiceId) return null;
  try {
    const res = await query('SELECT * FROM invoices WHERE invoice_id = $1 LIMIT 1', [invoiceId]);
    return res.rows[0] ? _formatInvoiceRow(res.rows[0]) : null;
  } catch (_) { return null; }
}

async function getUserInvoices(userId) {
  if (!userId) return [];
  try {
    const res = await query('SELECT * FROM invoices WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return res.rows.map(r => _formatInvoiceRow(r));
  } catch (_) { return []; }
}

async function getInvoiceByAddress(address) {
  if (!address) return null;
  try {
    const res = await query('SELECT * FROM invoices WHERE deposit_address = $1 LIMIT 1', [address]);
    return res.rows[0] ? _formatInvoiceRow(res.rows[0]) : null;
  } catch (_) { return null; }
}

async function getInvoiceByPaymentToken(token) {
  if (!token) return null;
  try {
    const res = await query('SELECT * FROM invoices WHERE payment_link_token = $1 LIMIT 1', [token]);
    return res.rows[0] ? _formatInvoiceRow(res.rows[0]) : null;
  } catch (_) { return null; }
}

async function getInvoiceByPaymentLinkOrId(ref) {
  if (!ref) return null;
  try {
    const res = await query('SELECT * FROM invoices WHERE invoice_id = $1 OR payment_link_token = $1 LIMIT 1', [ref]);
    return res.rows[0] ? _formatInvoiceRow(res.rows[0]) : null;
  } catch (_) { return null; }
}

async function createInvoice(invoiceId, userId, recipient, amount, currency, dueDate, depositAddress, paymentLinkToken) {
  if (!invoiceId || !userId) return;
  const now = Date.now();
  await query(`
    INSERT INTO invoices (invoice_id, user_id, recipient, amount, currency, due_date, deposit_address, payment_link_token, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (invoice_id) DO NOTHING
  `, [invoiceId, userId, recipient, amount, currency, dueDate, depositAddress || null, paymentLinkToken || null, now]);
}

async function updateInvoiceSettlement(invoiceId, txHash, token, status) {
  if (!invoiceId) return;
  await query(`
    UPDATE invoices
    SET settlement_tx_hash = $1, settlement_token = $2, status = $3
    WHERE invoice_id = $4
  `, [txHash, token, status, invoiceId]);
}

// ── Transactions Async Query Functions ──────────────────────────────────────

async function createTransaction(txId, userId, sender, recipient, amount, token, txHash, status) {
  if (!txId || !userId) return;
  const now = Date.now();
  await query(`
    INSERT INTO transactions (tx_id, user_id, sender, recipient, amount, token, tx_hash, status, timestamp)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (tx_id) DO NOTHING
  `, [txId, userId, sender, recipient, amount, token, txHash, status || 'completed', now]);
}

async function addTransaction(userId, type, amount, currency, status = 'completed', txId = null) {
  const id = txId || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const sender = type === 'deposit' ? 'external' : userId;
  const recipient = type === 'withdraw' ? 'external' : userId;
  return createTransaction(id, userId, sender, recipient, amount, currency, id, status);
}

async function getTransactions(userId) {
  if (!userId) return [];
  try {
    const res = await query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY timestamp DESC', [userId]);
    return res.rows;
  } catch (_) { return []; }
}

// ── Accounts, Cards & KYC Documents Async Query Functions ───────────────────

async function getAccountsForProfile(profileId) {
  if (!profileId) return [];
  const res = await query('SELECT * FROM virtual_receiving_accounts WHERE user_id = $1 OR id LIKE $2 ORDER BY created_at ASC', [profileId, `%${profileId}%`]);
  return res.rows;
}

async function createCard({ cardId, profileId, nuvionAccountId, bufferThreshold = 5.0, refillAmount = 20.0, cardType = 'virtual', currency = 'USD', last4 = '4821', cardNumber = null, cvv = null, expiry = null, brand = 'Visa', status = 'active', nameOnCard = null, context = 'personal' }) {
  const id = cardId || `card_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = Date.now();
  await query(`
    INSERT INTO cards (
      card_id, profile_id, nuvion_account_id, buffer_threshold, refill_amount,
      created_at, card_type, currency, last4, card_number, cvv, expiry, brand, status, name_on_card, context
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    ON CONFLICT (card_id) DO UPDATE SET
      status = EXCLUDED.status,
      refill_amount = EXCLUDED.refill_amount,
      buffer_threshold = EXCLUDED.buffer_threshold
  `, [
    id, profileId, nuvionAccountId, bufferThreshold, refillAmount,
    now, cardType, currency, last4, cardNumber, cvv, expiry, brand, status, nameOnCard, context
  ]);
  return id;
}

async function getCardsForProfile(profileId) {
  if (!profileId) return [];
  const res = await query('SELECT * FROM cards WHERE profile_id = $1 ORDER BY created_at DESC', [profileId]);
  return res.rows;
}

async function getAllCards() {
  const res = await query('SELECT * FROM cards ORDER BY created_at DESC');
  return res.rows;
}

async function getKycDocument(profileId, docKey) {
  if (!profileId || !docKey) return null;
  const res = await query('SELECT * FROM kyc_documents WHERE profile_id = $1 AND doc_key = $2 LIMIT 1', [profileId, docKey]);
  return res.rows[0] || null;
}

async function saveKycDocument(profileId, nuvionDocumentId, docKey, status) {
  const docId = `doc_${Date.now()}_${require('crypto').randomBytes(4).toString('hex')}`;
  const now = Date.now();
  await query(`
    INSERT INTO kyc_documents (document_id, profile_id, nuvion_document_id, doc_key, status, uploaded_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (document_id) DO UPDATE SET status = EXCLUDED.status
  `, [docId, profileId, nuvionDocumentId, docKey, status || 'uploaded', now]);
  return docId;
}

async function getKycDocuments(profileId) {
  if (!profileId) return [];
  const res = await query('SELECT * FROM kyc_documents WHERE profile_id = $1 ORDER BY uploaded_at DESC', [profileId]);
  return res.rows;
}



// ── Customer Async Query Functions ──────────────────────────────────────────

async function createCustomer({ customerId, userId, name, email, phone, notes }) {
  if (!customerId || !userId) return;
  const now = Date.now();
  await query(`
    INSERT INTO customers (customer_id, user_id, name, email, phone, notes, invoice_count, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, 0, $7)
    ON CONFLICT (customer_id) DO NOTHING
  `, [customerId, userId, name, email || null, phone || null, notes || null, now]);
}

async function findCustomerByName(userId, name) {
  if (!userId || !name) return null;
  const res = await query('SELECT * FROM customers WHERE user_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1', [userId, name]);
  return res.rows[0] || null;
}

async function updateCustomer(customerId, { email, phone, notes }) {
  if (!customerId) return;
  await query(`
    UPDATE customers SET email = COALESCE($1, email), phone = COALESCE($2, phone), notes = COALESCE($3, notes) WHERE customer_id = $4
  `, [email || null, phone || null, notes || null, customerId]);
}

async function getCustomers(userId, limit = 50) {
  if (!userId) return [];
  const res = await query('SELECT * FROM customers WHERE user_id = $1 ORDER BY invoice_count DESC, created_at DESC LIMIT $2', [userId, limit]);
  return res.rows;
}

async function incrementCustomerInvoiceCount(customerId) {
  if (!customerId) return;
  await query('UPDATE customers SET invoice_count = invoice_count + 1 WHERE customer_id = $1', [customerId]);
}

async function findCustomerByMagicIssuer(issuer) {
  if (!issuer) return null;
  const res = await query('SELECT * FROM customers WHERE magic_issuer = $1 LIMIT 1', [issuer]);
  return res.rows[0] || null;
}

async function linkCustomerMagicIssuer(customerId, issuer) {
  if (!customerId || !issuer) return;
  await query('UPDATE customers SET magic_issuer = $1 WHERE customer_id = $2', [issuer, customerId]);
}

// ── Split Bills Async Query Functions ──────────────────────────────────────

async function createSplitBill({ splitId, creatorId, totalAmount, currency }) {
  if (!splitId || !creatorId) return;
  const now = Date.now();
  await query(`
    INSERT INTO split_bills (split_id, creator_id, total_amount, currency, status, created_at)
    VALUES ($1, $2, $3, $4, 'pending', $5)
    ON CONFLICT (split_id) DO NOTHING
  `, [splitId, creatorId, totalAmount, currency, now]);
}

async function addSplitParticipant({ splitId, username, amountOwed }) {
  if (!splitId || !username) return;
  await query(`
    INSERT INTO split_participants (split_id, telegram_username, amount_owed, status)
    VALUES ($1, $2, $3, 'pending')
  `, [splitId, username, amountOwed]);
}

// ── Onboarding & Balance Async Functions ───────────────────────────────────

async function saveOnboardingDraft(userId, type, draftData) {
  const profile = await getProfileByType(userId, type);
  if (!profile) return null;
  const profileId = profile.profile_id;
  const fields = ['date_of_birth', 'nationality', 'gender', 'bvn', 'nin',
    'phone_number', 'contact_email', 'address_line_1', 'address_line_2',
    'address_city', 'address_state', 'address_postal_code', 'address_country_code'];
  const updates = [];
  const values = [];
  let idx = 1;
  for (const field of fields) {
    if (draftData[field] !== undefined) {
      updates.push(`"${field}" = $${idx}`);
      values.push(draftData[field]);
      idx++;
    }
  }
  if (updates.length === 0) return profile;
  values.push(profileId);
  await query(`UPDATE profiles SET ${updates.join(', ')} WHERE profile_id = $${idx}`, values);
  return getProfile(profileId);
}

async function updateVerificationStatus(profileId, status, rejectionReasons = null, pendingRequirements = null) {
  if (!profileId) return;
  await query(`UPDATE profiles SET verification_status = $1, rejection_reasons = $2, pending_requirements = $3 WHERE profile_id = $4`, [status, rejectionReasons, pendingRequirements, profileId]);
}

async function getProfilesPendingReview(ceilingMs = 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - ceilingMs;
  const res = await query("SELECT * FROM profiles WHERE verification_status = 'pending' AND created_at < $1", [cutoff]);
  return res.rows;
}

async function getProfilesForKycBackfill() {
  const res = await query("SELECT * FROM profiles WHERE verification_status IN ('not_started', 'incomplete', 'rejected')");
  return res.rows;
}

async function getUserBalance(telegramId) {
  const user = await getUser(telegramId);
  if (!user) return null;
  const txs = await getTransactions(telegramId);
  let usdBalance = 0;
  let ngnBalance = 0;
  for (const tx of txs) {
    const amount = Number(tx.amount || 0);
    if (tx.currency === 'USDC' || tx.currency === 'USDT' || tx.currency === 'USD') {
      if (tx.status === 'completed' || tx.status === 'confirmed') usdBalance += amount;
    } else if (tx.currency === 'NGN') {
      if (tx.status === 'completed' || tx.status === 'confirmed') ngnBalance += amount;
    }
  }
  const fxService = require('./fx-service');
  return { usd_balance: usdBalance, ngn_balance: ngnBalance, fx_rate: fxService.getRate() };
}

async function updateUserWalletMapping(telegramId, personalSmartAccount, businessSmartAccount, authProvider) {
  if (!telegramId) return;
  await query(`
    UPDATE users SET personal_smart_account = $1, business_smart_account = $2, auth_provider = $3 WHERE telegram_id = $4 OR user_id = $4
  `, [personalSmartAccount, businessSmartAccount, authProvider, telegramId]);
}

async function createHdDeposit(depositId, userId, expectedAmount, currency, depositAddress, privateKey, virtualAccountNo) {
  if (!depositId || !userId) return;
  const now = Date.now();
  await query(`
    INSERT INTO hd_deposits (deposit_id, user_id, expected_amount, currency, deposit_address, deposit_wallet_private_key, virtual_account_no, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (deposit_id) DO NOTHING
  `, [depositId, userId, expectedAmount, currency, depositAddress, privateKey, virtualAccountNo, now]);
}

async function getHdDeposit(depositAddress) {
  if (!depositAddress) return null;
  const res = await query('SELECT * FROM hd_deposits WHERE deposit_address = $1 OR virtual_account_no = $1 LIMIT 1', [depositAddress]);
  return res.rows[0] || null;
}

async function updateHdDepositStatus(depositId, status) {
  if (!depositId) return;
  await query('UPDATE hd_deposits SET status = $1 WHERE deposit_id = $2', [status, depositId]);
}

async function updateHdDepositAddress(depositId, newDepositAddress) {
  if (!depositId) return;
  await query('UPDATE hd_deposits SET deposit_address = $1 WHERE deposit_id = $2', [newDepositAddress, depositId]);
}

async function updateAutoSaveSettings(telegramId, percent, saveType, durationDays) {
  if (!telegramId) return;
  await query(`
    UPDATE users SET auto_save_percent = $1, auto_save_type = $2, auto_save_duration_days = $3 WHERE telegram_id = $4 OR user_id = $4
  `, [percent, saveType || 'lock', durationDays || 30, telegramId]);
}

async function updateUserName(userId, firstName, lastName) {
  if (!userId) return;
  await query(`UPDATE users SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name) WHERE telegram_id = $3 OR user_id = $3`, [firstName, lastName, userId]);
}

async function updateProfileNuvionEntity(profileId, nuvionEntityId) {
  if (!profileId) return;
  await query('UPDATE profiles SET kyb_status = $1 WHERE profile_id = $2', [nuvionEntityId, profileId]);
}

// ── Savings Locks & Goals Async Query Functions ────────────────────────────

async function createSavingsLock(userId, amount, currency, durationDays = 30) {
  if (!userId || !amount) return null;
  const lockId = `lock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();
  await query(`
    INSERT INTO savings_locks (lock_id, user_id, amount, currency, interest_rate, start_time, duration_days, status)
    VALUES ($1, $2, $3, $4, 0.08, $5, $6, 'active')
    ON CONFLICT (lock_id) DO NOTHING
  `, [lockId, userId, amount, currency, now, durationDays]);
  return lockId;
}

async function getActiveSavingsLocks(userId) {
  if (!userId) return [];
  const res = await query("SELECT * FROM savings_locks WHERE user_id = $1 AND status = 'active' ORDER BY start_time DESC", [userId]);
  return res.rows;
}

async function getSavingsLocks(userId) {
  if (!userId) return [];
  const res = await query('SELECT * FROM savings_locks WHERE user_id = $1 ORDER BY start_time DESC', [userId]);
  return res.rows;
}

async function getSavingsLock(lockId) {
  if (!lockId) return null;
  const res = await query('SELECT * FROM savings_locks WHERE lock_id = $1 LIMIT 1', [lockId]);
  return res.rows[0] || null;
}

async function createSavingsGoal({ goalId, userId, name, targetAmount, currency = 'USDC' }) {
  if (!goalId || !userId) return;
  const now = Date.now();
  await query(`
    INSERT INTO savings_goals (goal_id, user_id, name, target_amount, current_amount, currency, status, created_at)
    VALUES ($1, $2, $3, $4, 0, $5, 'active', $6)
    ON CONFLICT (goal_id) DO NOTHING
  `, [goalId, userId, name, targetAmount, currency, now]);
}

async function getSavingsGoal(goalId) {
  if (!goalId) return null;
  const res = await query('SELECT * FROM savings_goals WHERE goal_id = $1 LIMIT 1', [goalId]);
  return res.rows[0] || null;
}

async function getActiveSavingsGoals(userId) {
  if (!userId) return [];
  const res = await query("SELECT * FROM savings_goals WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC", [userId]);
  return res.rows;
}

async function updateSavingsGoalProgress(goalId, addAmount) {
  if (!goalId || !addAmount) return;
  await query('UPDATE savings_goals SET current_amount = current_amount + $1 WHERE goal_id = $2', [addAmount, goalId]);
}

// ── Payroll Async Query Functions ─────────────────────────────────────────

async function createPayrollBatch({ batchId, userId, totalAmount, currency, recipientCount = 0, autoExecute = 0 }) {
  if (!batchId || !userId) return;
  const now = Date.now();
  await query(`
    INSERT INTO payroll_batches (batch_id, user_id, total_amount, currency, recipient_count, status, auto_execute, created_at)
    VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)
    ON CONFLICT (batch_id) DO NOTHING
  `, [batchId, userId, totalAmount, currency, recipientCount, autoExecute ? 1 : 0, now]);
}

async function createPayrollLine({ lineId, batchId, employeeName, accountNumber, bankCode, amount }) {
  if (!lineId || !batchId) return;
  await query(`
    INSERT INTO payroll_lines (line_id, batch_id, employee_name, account_number, bank_code, amount, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'pending')
    ON CONFLICT (line_id) DO NOTHING
  `, [lineId, batchId, employeeName, accountNumber, bankCode, amount]);
}

async function getPayrollBatch(batchId) {
  if (!batchId) return null;
  const res = await query('SELECT * FROM payroll_batches WHERE batch_id = $1 LIMIT 1', [batchId]);
  return res.rows[0] || null;
}

async function getPayrollLines(batchId) {
  if (!batchId) return [];
  const res = await query('SELECT * FROM payroll_lines WHERE batch_id = $1', [batchId]);
  return res.rows;
}

async function updatePayrollBatchStatus(batchId, status) {
  if (!batchId) return;
  await query('UPDATE payroll_batches SET status = $1 WHERE batch_id = $2', [status, batchId]);
}

async function updatePayrollLineStatus(lineId, status) {
  if (!lineId) return;
  await query('UPDATE payroll_lines SET status = $1 WHERE line_id = $2', [status, lineId]);
}

async function getAutoExecutePayrollBatches() {
  const res = await query("SELECT * FROM payroll_batches WHERE status = 'pending' AND auto_execute = 1");
  return res.rows;
}

async function createPayrollApproval({ approvalId, batchId, approverId }) {
  if (!approvalId || !batchId) return;
  const now = Date.now();
  await query(`
    INSERT INTO payroll_approvals (approval_id, batch_id, approver_id, status, created_at)
    VALUES ($1, $2, $3, 'pending', $4)
    ON CONFLICT (approval_id) DO NOTHING
  `, [approvalId, batchId, approverId, now]);
}

async function getPayrollApproval(approvalId) {
  if (!approvalId) return null;
  const res = await query('SELECT * FROM payroll_approvals WHERE approval_id = $1 LIMIT 1', [approvalId]);
  return res.rows[0] || null;
}

async function updatePayrollApprovalStatus(approvalId, status) {
  if (!approvalId) return;
  await query('UPDATE payroll_approvals SET status = $1 WHERE approval_id = $2', [status, approvalId]);
}

async function getPendingApprovalsForApprover(approverId) {
  if (!approverId) return [];
  const res = await query("SELECT * FROM payroll_approvals WHERE approver_id = $1 AND status = 'pending' ORDER BY created_at DESC", [approverId]);
  return res.rows;
}

async function updatePayrollApprovalSettings(userId, settings) {
  if (!userId) return;
  await query('UPDATE users SET low_balance_threshold = $1 WHERE telegram_id = $2 OR user_id = $2', [settings?.threshold || 0, userId]);
}

async function updateLowBalanceThreshold(userId, threshold) {
  if (!userId) return;
  await query('UPDATE users SET low_balance_threshold = $1 WHERE telegram_id = $2 OR user_id = $2', [threshold, userId]);
}

async function getUsersWithLowBalanceThreshold() {
  const res = await query('SELECT * FROM users WHERE low_balance_threshold > 0');
  return res.rows;
}

// ── Platform Fees & Recurring Invoices & Expenses ───────────────────────────

async function recordPlatformFee(feeId, userId, txId, amount, currency) {
  if (!feeId || !userId) return;
  const now = Date.now();
  await query(`
    INSERT INTO platform_fees (fee_id, user_id, tx_id, amount, currency, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (fee_id) DO NOTHING
  `, [feeId, userId, txId || null, amount, currency, now]);
}

async function recordAutoSaveEvent(eventId, userId, sourceTxId, savedAmount, lockId) {
  if (!eventId || !userId) return;
  const now = Date.now();
  await query(`
    INSERT INTO auto_save_events (event_id, user_id, source_tx_id, saved_amount, lock_id, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (event_id) DO NOTHING
  `, [eventId, userId, sourceTxId || null, savedAmount, lockId || null, now]);
}

async function createRecurringInvoice({ recurringId, userId, clientName, clientEmail, amount, currency, frequency, nextRunAt }) {
  if (!recurringId || !userId) return;
  const now = Date.now();
  await query(`
    INSERT INTO recurring_invoices (recurring_id, user_id, client_name, client_email, amount, currency, frequency, next_run_at, status, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)
    ON CONFLICT (recurring_id) DO NOTHING
  `, [recurringId, userId, clientName, clientEmail, amount, currency, frequency, nextRunAt, now]);
}

async function getActiveRecurringInvoices(userId) {
  if (!userId) return [];
  const res = await query("SELECT * FROM recurring_invoices WHERE user_id = $1 AND status = 'active'", [userId]);
  return res.rows;
}

async function getRecurringInvoice(recurringId) {
  if (!recurringId) return null;
  const res = await query('SELECT * FROM recurring_invoices WHERE recurring_id = $1 LIMIT 1', [recurringId]);
  return res.rows[0] || null;
}

async function getDueRecurringInvoices() {
  const now = Date.now();
  const res = await query("SELECT * FROM recurring_invoices WHERE status = 'active' AND next_run_at <= $1", [now]);
  return res.rows;
}

async function updateRecurringNextRun(recurringId, nextRunAt) {
  if (!recurringId) return;
  await query('UPDATE recurring_invoices SET next_run_at = $1 WHERE recurring_id = $2', [nextRunAt, recurringId]);
}

async function createExpense({ expenseId, userId, category, amount, currency, description }) {
  if (!expenseId || !userId) return;
  const now = Date.now();
  await query(`
    INSERT INTO expenses (expense_id, user_id, category, amount, currency, description, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (expense_id) DO NOTHING
  `, [expenseId, userId, category, amount, currency, description, now]);
}

async function getExpenses(userId) {
  if (!userId) return [];
  const res = await query('SELECT * FROM expenses WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return res.rows;
}

async function getExpenseSummaryByCategory(userId) {
  if (!userId) return [];
  const res = await query('SELECT category, SUM(amount) as total_amount, currency FROM expenses WHERE user_id = $1 GROUP BY category, currency', [userId]);
  return res.rows;
}

async function createInvoiceReminder({ reminderId, invoiceId, remindAt }) {
  if (!reminderId || !invoiceId) return;
  await query(`
    INSERT INTO invoice_reminders (reminder_id, invoice_id, remind_at, status)
    VALUES ($1, $2, $3, 'pending')
    ON CONFLICT (reminder_id) DO NOTHING
  `, [reminderId, invoiceId, remindAt]);
}

async function getDueInvoiceReminders() {
  const now = Date.now();
  const res = await query("SELECT * FROM invoice_reminders WHERE status = 'pending' AND remind_at <= $1", [now]);
  return res.rows;
}

async function updateInvoiceReminderStatus(reminderId, status) {
  if (!reminderId) return;
  await query('UPDATE invoice_reminders SET status = $1 WHERE reminder_id = $2', [status, reminderId]);
}

async function createFxRateLock({ lockId, userId, fromCurrency, toCurrency, rate, expiresAt }) {
  if (!lockId || !userId) return;
  await query(`
    INSERT INTO fx_rate_locks (lock_id, user_id, from_currency, to_currency, rate, expires_at, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'active')
    ON CONFLICT (lock_id) DO NOTHING
  `, [lockId, userId, fromCurrency, toCurrency, rate, expiresAt]);
}

async function getFxRateLock(lockId) {
  if (!lockId) return null;
  const res = await query('SELECT * FROM fx_rate_locks WHERE lock_id = $1 LIMIT 1', [lockId]);
  return res.rows[0] || null;
}

// ── Session Keys & Passkeys ─────────────────────────────────────────────────

async function saveSessionKey({ keyId, userId, publicKey, expiresAt }) {
  if (!keyId || !userId) return;
  const now = Date.now();
  await query(`
    INSERT INTO session_keys (key_id, user_id, public_key, expires_at, usage_count, status, created_at)
    VALUES ($1, $2, $3, $4, 0, 'active', $5)
    ON CONFLICT (key_id) DO NOTHING
  `, [keyId, userId, publicKey, expiresAt, now]);
}

async function getActiveSessionKey(userId) {
  if (!userId) return null;
  const now = Date.now();
  const res = await query("SELECT * FROM session_keys WHERE user_id = $1 AND status = 'active' AND expires_at > $2 LIMIT 1", [userId, now]);
  return res.rows[0] || null;
}

async function updateSessionKeyUsage(keyId) {
  if (!keyId) return;
  await query('UPDATE session_keys SET usage_count = usage_count + 1 WHERE key_id = $1', [keyId]);
}

async function revokeSessionKey(keyId) {
  if (!keyId) return;
  await query("UPDATE session_keys SET status = 'revoked' WHERE key_id = $1", [keyId]);
}

async function getSessionKeysForUser(userId) {
  if (!userId) return [];
  const res = await query('SELECT * FROM session_keys WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return res.rows;
}

async function savePasskeyCredential({ credentialId, userId, publicKey }) {
  if (!credentialId || !userId) return;
  const now = Date.now();
  await query(`
    INSERT INTO passkey_credentials (credential_id, user_id, public_key, sign_count, created_at)
    VALUES ($1, $2, $3, 0, $4)
    ON CONFLICT (credential_id) DO NOTHING
  `, [credentialId, userId, publicKey, now]);
}

async function getPasskeyCredential(credentialId) {
  if (!credentialId) return null;
  const res = await query('SELECT * FROM passkey_credentials WHERE credential_id = $1 LIMIT 1', [credentialId]);
  return res.rows[0] || null;
}

async function getPasskeyCredentialsForUser(userId) {
  if (!userId) return [];
  const res = await query('SELECT * FROM passkey_credentials WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return res.rows;
}

async function updatePasskeySignCount(credentialId, newSignCount) {
  if (!credentialId) return;
  await query('UPDATE passkey_credentials SET sign_count = $1 WHERE credential_id = $2', [newSignCount, credentialId]);
}

async function getTotalCollectedFees() {
  const res = await query('SELECT SUM(amount) as total_fees, COUNT(*) as count FROM platform_fees');
  return { totalFeesCollectedUsdt: Number(res.rows[0]?.total_fees || 0), totalFeeTransactions: Number(res.rows[0]?.count || 0) };
}

async function getFeeLedger() {
  const res = await query('SELECT * FROM platform_fees ORDER BY created_at DESC LIMIT 100');
  return res.rows;
}

async function createOperation(operationId, userId, transactionId, type) {
  if (!operationId || !userId) return;
  const now = Date.now();
  await query(`
    INSERT INTO operations (operation_id, user_id, transaction_id, type, status, created_at)
    VALUES ($1, $2, $3, $4, 'pending', $5)
    ON CONFLICT (operation_id) DO NOTHING
  `, [operationId, userId, transactionId || null, type, now]);
}

async function updateOperationStatus(operationId, status) {
  if (!operationId) return;
  await query('UPDATE operations SET status = $1 WHERE operation_id = $2', [status, operationId]);
}

async function getPendingOperations() {
  const res = await query("SELECT * FROM operations WHERE status = 'pending' ORDER BY created_at DESC");
  return res.rows;
}

async function getOperationsByTransactionId(transactionId) {
  if (!transactionId) return [];
  const res = await query('SELECT * FROM operations WHERE transaction_id = $1 ORDER BY created_at DESC', [transactionId]);
  return res.rows;
}

// ── Referrals & Points Async Query Functions ────────────────────────────────

async function getOrCreateReferralCode(userId) {
  if (!userId) return 'PAYIT100';
  const existing = await query('SELECT referral_code FROM referrals WHERE referrer_id = $1 LIMIT 1', [userId]);
  if (existing.rows[0]?.referral_code) return existing.rows[0].referral_code;
  const code = `PAYIT${Math.floor(1000 + Math.random() * 9000)}`;
  return code;
}

async function recordReferral(referrerId, referredId, code) {
  if (!referrerId || !referredId) return;
  const refId = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();
  await query(`
    INSERT INTO referrals (referral_id, referrer_id, referred_id, referral_code, created_at)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (referral_id) DO NOTHING
  `, [refId, referrerId, referredId, code || 'PAYIT', now]);
}

async function recordFeeAndDistributeReferral(userId, txId, amount, currency) {
  if (!userId || !amount) return;
  const feeId = `fee_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await recordPlatformFee(feeId, userId, txId, amount, currency);
}

async function awardUserPoints(userId, points, reason) {
  if (!userId || !points) return;
  await query(`
    INSERT INTO user_points (user_id, points_balance, total_earned)
    VALUES ($1, $2, $2)
    ON CONFLICT (user_id) DO UPDATE SET
      points_balance = user_points.points_balance + EXCLUDED.points_balance,
      total_earned = user_points.total_earned + EXCLUDED.total_earned
  `, [userId, points]);
}

async function getReferralStats(userId) {
  if (!userId) return { count: 0, totalEarned: 0 };
  const refRes = await query('SELECT COUNT(*) FROM referrals WHERE referrer_id = $1', [userId]);
  const earnRes = await query('SELECT SUM(amount) as total FROM referral_earnings WHERE referrer_id = $1', [userId]);
  return { count: parseInt(refRes.rows[0]?.count || '0', 10), totalEarned: Number(earnRes.rows[0]?.total || 0) };
}

async function claimReferralEarnings(userId) {
  if (!userId) return 0;
  const res = await query("SELECT SUM(amount) as total FROM referral_earnings WHERE referrer_id = $1 AND status = 'unclaimed'", [userId]);
  const total = Number(res.rows[0]?.total || 0);
  if (total > 0) {
    await query("UPDATE referral_earnings SET status = 'claimed' WHERE referrer_id = $1 AND status = 'unclaimed'", [userId]);
  }
  return total;
}

async function getUserPointsStats(userId) {
  if (!userId) return { balance: 0, totalEarned: 0 };
  const res = await query('SELECT * FROM user_points WHERE user_id = $1 LIMIT 1', [userId]);
  return { balance: res.rows[0]?.points_balance || 0, totalEarned: res.rows[0]?.total_earned || 0 };
}

async function redeemPointsForBill(userId, points) {
  if (!userId || !points) return false;
  const pts = await getUserPointsStats(userId);
  if (pts.balance < points) return false;
  await query('UPDATE user_points SET points_balance = points_balance - $1 WHERE user_id = $2', [points, userId]);
  const redId = `red_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await query(`
    INSERT INTO point_redemptions (redemption_id, user_id, points_spent, reward_description, created_at)
    VALUES ($1, $2, $3, 'Bill Discount', $4)
  `, [redId, userId, points, Date.now()]);
  return true;
}

async function createSyncCode(userId, ttlMinutes = 15) {
  if (!userId) return null;
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + (ttlMinutes * 60 * 1000);
  await query(`
    INSERT INTO sync_codes (code, user_id, expires_at, used)
    VALUES ($1, $2, $3, 0)
    ON CONFLICT (code) DO UPDATE SET user_id = EXCLUDED.user_id, expires_at = EXCLUDED.expires_at, used = 0
  `, [code, userId, expiresAt]);
  return code;
}

async function getSyncCode(code) {
  if (!code) return null;
  const res = await query('SELECT * FROM sync_codes WHERE code = $1 LIMIT 1', [code]);
  return res.rows[0] || null;
}

async function markSyncCodeUsed(code) {
  if (!code) return;
  await query('UPDATE sync_codes SET used = 1 WHERE code = $1', [code]);
}



module.exports = {
  getUser,
  getProfile,
  getProfilesForUser,
  getProfileByType,
  createUser,
  updateUserContext,
  updateOwnerAddress,
  updateUserPin,
  updateBusinessProfile,
  saveBusinessProfile,
  updateFullBusinessProfile,
  updateBusinessKybCac,
  getProfileKybStatus,
  validateBusinessKyb,
  findExistingKycUser,
  findExistingKybUser,
  updateUserNin,
  getUnverifiedTelegramUsers,
  updateUserNuvionAccount,
  updateUserBusinessNuvionAccount,
  getProfileByNuvionAccount,
  getUserByNuvionAccount,
  getUserByMagicIssuer,
  getUserByOwnerAddress,
  linkTelegramIdToUser,
  createAuditLog,
  getAuditLogs,
  createNotification,
  getNotifications,
  getUnreadNotificationCount,
  markNotificationsRead,
  getFormattedVerifiedName,

  // Invoice & Transaction functions
  createFullInvoice,
  markInvoicePaid,
  getPendingInvoices,
  getInvoiceByVirtualAccount,
  getInvoice,
  getUserInvoices,
  getInvoiceByAddress,
  getInvoiceByPaymentToken,
  getInvoiceByPaymentLinkOrId,
  createInvoice,
  updateInvoiceSettlement,
  createTransaction,
  addTransaction,
  getTransactions,

  // Accounts, Cards & KYC Docs
  getAccountsForProfile,
  createCard,
  getCardsForProfile,
  getAllCards,
  getKycDocument,
  saveKycDocument,
  getKycDocuments,

  // Customers, Split Bills, Payroll, Savings, Referrals & Sync Codes
  createCustomer,
  findCustomerByName,
  updateCustomer,
  getCustomers,
  incrementCustomerInvoiceCount,
  findCustomerByMagicIssuer,
  linkCustomerMagicIssuer,
  createSplitBill,
  addSplitParticipant,
  saveOnboardingDraft,
  updateVerificationStatus,
  getProfilesPendingReview,
  getProfilesForKycBackfill,
  getUserBalance,
  updateUserWalletMapping,
  createHdDeposit,
  getHdDeposit,
  updateHdDepositStatus,
  updateHdDepositAddress,
  updateAutoSaveSettings,
  updateUserName,
  updateProfileNuvionEntity,
  createSavingsLock,
  getActiveSavingsLocks,
  getSavingsLocks,
  getSavingsLock,
  createPayrollBatch,
  createPayrollLine,
  getPayrollBatch,
  getPayrollLines,
  updatePayrollBatchStatus,
  updatePayrollLineStatus,
  getAutoExecutePayrollBatches,
  recordPlatformFee,
  recordAutoSaveEvent,
  createRecurringInvoice,
  getActiveRecurringInvoices,
  getRecurringInvoice,
  getDueRecurringInvoices,
  updateRecurringNextRun,
  createExpense,
  getExpenses,
  getExpenseSummaryByCategory,
  createSavingsGoal,
  getSavingsGoal,
  getActiveSavingsGoals,
  updateSavingsGoalProgress,
  createInvoiceReminder,
  getDueInvoiceReminders,
  updateInvoiceReminderStatus,
  createFxRateLock,
  getFxRateLock,
  createPayrollApproval,
  getPayrollApproval,
  updatePayrollApprovalStatus,
  getPendingApprovalsForApprover,
  updateLowBalanceThreshold,
  updatePayrollApprovalSettings,
  getUsersWithLowBalanceThreshold,
  saveSessionKey,
  getActiveSessionKey,
  updateSessionKeyUsage,
  revokeSessionKey,
  getSessionKeysForUser,
  savePasskeyCredential,
  getPasskeyCredential,
  getPasskeyCredentialsForUser,
  updatePasskeySignCount,
  getTotalCollectedFees,
  getFeeLedger,
  createOperation,
  updateOperationStatus,
  getPendingOperations,
  getOperationsByTransactionId,
  getOrCreateReferralCode,
  recordReferral,
  recordFeeAndDistributeReferral,
  awardUserPoints,
  getReferralStats,
  claimReferralEarnings,
  createSyncCode,
  getSyncCode,
  markSyncCodeUsed,

  // Helper exports
  query,
  pool
};

module.exports.db = module.exports;
