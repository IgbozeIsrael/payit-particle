const db = require('../src/db');
const nuvionService = require('../src/nuvion-service');
const particleService = require('../src/particle-service');
const fxService = require('../src/fx-service');

async function main() {
  const emailOrId = process.argv[2] || 'igbozeigboze@gmail.com';
  console.log(`\n🔍 Fetching Live Nuvion & Particle Network Balances for: "${emailOrId}"...\n`);

  const user = db.getUser(emailOrId);
  if (!user) {
    console.log(`❌ User not found.`);
    process.exit(1);
  }

  const telegramId = user.user_id || user.telegram_id;
  const personalSmart = user.personal_smart_account || '0x442e2E7EAC9c3f190e837d5ef74dD037EC235B24';
  const businessSmart = user.business_smart_account || '0x37e625e993F63de87be5f0a801462aCABfEA4bC9';

  // 1. Nuvion Live Fiat Balances
  let nuvionPersonalNgn = 0;
  let nuvionBusinessNgn = 0;
  try {
    const pSync = await nuvionService.syncNuvionLiveAccountBalance(telegramId, 'personal');
    nuvionPersonalNgn = pSync?.liveNgn || 0;
  } catch (e) {
    console.warn('[Nuvion Sync Personal Warning]:', e.message);
  }

  try {
    const bSync = await nuvionService.syncNuvionLiveAccountBalance(telegramId, 'business');
    nuvionBusinessNgn = bSync?.liveNgn || 0;
  } catch (e) {
    console.warn('[Nuvion Sync Business Warning]:', e.message);
  }

  // 2. Particle Network Unified Smart Account Crypto Balances
  let personalCryptoBalance = { totalAmountInUSD: '0.00', assets: [] };
  let businessCryptoBalance = { totalAmountInUSD: '0.00', assets: [] };

  try {
    if (personalSmart) {
      personalCryptoBalance = await particleService.getUnifiedBalance(personalSmart);
    }
  } catch (e) {
    console.warn('[Particle Personal Balance Warning]:', e.message);
  }

  try {
    if (businessSmart) {
      businessCryptoBalance = await particleService.getUnifiedBalance(businessSmart);
    }
  } catch (e) {
    console.warn('[Particle Business Balance Warning]:', e.message);
  }

  // 3. HD Deposit Ledger in SQLite
  let totalLedgerDeposits = 0;
  try {
    const row = db.db.prepare(`
      SELECT SUM(expected_amount) as total FROM hd_deposits 
      WHERE user_id = ? OR deposit_address IN (?, ?)
    `).get(telegramId, personalSmart, businessSmart);
    totalLedgerDeposits = Number(row?.total || 0);
  } catch (_) {}

  const currentFxRate = fxService.getRate();

  const balanceReport = {
    user_identifier: telegramId,
    fx_rate_usd_ngn: currentFxRate,
    nuvion_fiat_balances: {
      personal_ngn: `₦${nuvionPersonalNgn.toLocaleString()} NGN (~$${(nuvionPersonalNgn / currentFxRate).toFixed(2)} USD)`,
      business_ngn: `₦${nuvionBusinessNgn.toLocaleString()} NGN (~$${(nuvionBusinessNgn / currentFxRate).toFixed(2)} USD)`
    },
    particle_network_crypto_balances: {
      personal_smart_account: {
        address: personalSmart,
        total_usd: `$${personalCryptoBalance?.totalAmountInUSD || '0.00'} USD`,
        assets: personalCryptoBalance?.assets || []
      },
      business_smart_account: {
        address: businessSmart,
        total_usd: `$${businessCryptoBalance?.totalAmountInUSD || '0.00'} USD`,
        assets: businessCryptoBalance?.assets || []
      }
    },
    sqlite_recorded_deposits_ledger: `$${totalLedgerDeposits.toFixed(2)} USDT`
  };

  console.log('✅ LIVE BALANCES SUMMARY REPORT:');
  console.log(JSON.stringify(balanceReport, null, 2));
  console.log('\n✨ Balance query completed successfully!\n');
}

main().catch(console.error);
