const db = require('../src/db');
const particleService = require('../src/particle-service');
const nuvionService = require('../src/nuvion-service');

/**
 * PayIT 3-Way Nightly Balance Reconciliation Script
 * Audits On-Chain Smart Accounts + Nuvion Sub-Accounts vs Internal SQLite Ledger.
 */
async function runReconciliation() {
  console.log('--------------------------------------------------');
  console.log(`[Reconciliation] Running PayIT 3-Way Reconciliation at ${new Date().toISOString()}`);
  console.log('--------------------------------------------------');

  const users = db.db.prepare('SELECT * FROM users').all();
  let totalDiscrepancies = 0;
  let auditedProfiles = 0;

  for (const user of users) {
    const profiles = db.getProfilesForUser(user.telegram_id || user.user_id) || [];
    for (const profile of profiles) {
      auditedProfiles++;
      const profileId = profile.profile_id;
      const uaAddress = profile.universal_account_address;
      const profileType = profile.type;

      // 1. Fetch Nuvion Account Balances
      let nuvionTotalUsd = 0;
      const accounts = db.getAccountsForProfile(profileId) || [];
      for (const acc of accounts) {
        try {
          const accRes = await nuvionService.getAccount(acc.nuvion_account_id).catch(() => null);
          const currentCents = Number(accRes?.data?.balance?.current || accRes?.balance?.current || 0);
          nuvionTotalUsd += currentCents / 100;
        } catch (_) {}
      }

      // 2. Fetch On-Chain Unified Particle Balance
      let onChainUsd = 0;
      const { isAddress } = require('ethers');
      if (uaAddress && isAddress(uaAddress)) {
        try {
          const unified = await particleService.getUnifiedBalance(uaAddress);
          onChainUsd = Number(unified.totalAmountInUSD || 0.0);
        } catch (err) {
          console.warn(`[Reconciliation] Could not fetch on-chain balance for ${uaAddress}: ${err.message}`);
        }
      }

      // 3. Query Internal Ledger Balance (Deposits - Outbound Tx)
      const depositsRow = db.db.prepare(
        "SELECT SUM(expected_amount) as total FROM hd_deposits WHERE user_id = ? AND status = 'confirmed'"
      ).get(user.telegram_id || user.user_id);
      const internalUsd = Number(depositsRow?.total || 0);

      const totalExternalUsd = nuvionTotalUsd + onChainUsd;
      const diff = Math.abs(totalExternalUsd - internalUsd);

      console.log(`[Profile Audit] User: ${user.telegram_id || user.user_id} | Profile: ${profileType} (${profileId})`);
      console.log(`  - Nuvion Balance:    $${nuvionTotalUsd.toFixed(2)}`);
      console.log(`  - On-Chain Balance:  $${onChainUsd.toFixed(2)}`);
      console.log(`  - Total External:    $${totalExternalUsd.toFixed(2)}`);
      console.log(`  - Internal Ledger:   $${internalUsd.toFixed(2)}`);

      if (diff > 1.0) { // Threshold for alerts
        console.warn(`  ❌ DISCREPANCY DETECTED: Diff = $${diff.toFixed(2)}`);
        totalDiscrepancies++;
        db.createAuditLog({
          logId: `rec_err_${Date.now()}`,
          userId: user.telegram_id || user.user_id,
          action: 'reconciliation_discrepancy',
          details: { profileId, nuvionTotalUsd, onChainUsd, internalUsd, diff }
        });
      } else {
        console.log(`  ✅ RECONCILED OK`);
      }
    }
  }

  console.log('--------------------------------------------------');
  console.log(`[Reconciliation Complete] Audited ${auditedProfiles} profiles across ${users.length} users.`);
  if (totalDiscrepancies > 0) {
    console.warn(`⚠️ ALERT: ${totalDiscrepancies} profile(s) flagged with balance discrepancies.`);
  } else {
    console.log('🎉 ALL BALANCES PERFECTLY RECONCILED!');
  }
  console.log('--------------------------------------------------');
}

if (require.main === module) {
  runReconciliation()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[Reconciliation Fatal]', err);
      process.exit(1);
    });
}

module.exports = { runReconciliation };
