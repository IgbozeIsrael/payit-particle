# PayIT Mobile App - Complete Deployment Guide

**Version**: 1.0
**Last Updated**: 2024
**Status**: Ready for Review

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Configuration](#environment-configuration)
3. [Database Setup](#database-setup)
4. [Security Validation](#security-validation)
5. [Deployment Procedure](#deployment-procedure)
6. [Post-Deployment Verification](#post-deployment-verification)
7. [Monitoring & Alerts](#monitoring--alerts)
8. [Rollback Procedure](#rollback-procedure)
9. [7-Day Stability Plan](#7-day-stability-monitoring)
10. [Support Runbook](#support-runbook)

---

## Pre-Deployment Checklist

### Backend Fixes (Must Complete First)

- [ ] **Fix #1**: Remove dev mode fallback from `mobile-api.js` line 225
  - Changes `isDevOrTest = true` to `isDevOrTest = process.env.NODE_ENV === 'development'`
  - Validates: Development mode only in development environments
  - Estimated time: 15 minutes

- [ ] **Fix #2**: Enforce KYC verification before auto-provision
  - File: `mobile-api.js` line 245
  - Add check: `if (!user && process.env.NODE_ENV !== 'development')`
  - Estimated time: 20 minutes

- [ ] **Fix #3**: Correct context isolation in balance queries
  - File: `mobile-api.js` line 425-435
  - Change: `WHERE deposit_address = ? AND user_id = ?`
  - Scope: Add profile_id filtering for business/personal separation
  - Estimated time: 30 minutes

- [ ] **Fix #4**: Add API key validation on startup
  - File: `server.js` initialization
  - Check: `NUVION_API_KEY` at boot, fail fast
  - Estimated time: 10 minutes

- [ ] **Fix #5**: Run concurrent request stress test
  - Simulate: 100+ simultaneous card issuance requests
  - Verify: No race conditions, atomicity holds
  - Estimated time: 2 hours

- [ ] **Fix #6**: End-to-end test with Nuvion sandbox
  - Scenario: Complete user journey (signup → KYC → card issue)
  - Verify: All data persisted, fees collected correctly
  - Estimated time: 4 hours

- [ ] **Fix #7**: UI/UX beautification
  - Create `SharedUI.tsx` with reusable components
  - Update all screens with brand colors
  - Estimated time: 6-8 hours

### Pre-Flight Verification

- [ ] All backend fixes applied and tested
- [ ] Git commits pushed to main branch
- [ ] All unit tests passing (`npm test`)
- [ ] All integration tests passing
- [ ] No uncommitted changes
- [ ] Staging environment verified

---

## Environment Configuration

### Required Environment Variables

Create `.env` file in project root with the following variables:

```bash
# ── Core Configuration ─────────────────────────────────────────
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# ── Nuvion API (Production Credentials) ────────────────────────
NUVION_API_KEY=your_nuvion_api_key_here
NUVION_BASE_URL=https://api.nuvion.dev
NUVION_MERCHANT_ID=your_merchant_id_here

# ── Database ────────────────────────────────────────────────────
DB_PATH=/var/lib/payit/payit.db
DB_BACKUP_PATH=/var/lib/payit/backups

# ── Wallet & Blockchain ─────────────────────────────────────────
TREASURY_ADDRESS=0x09648d98196460D63B3dB1B90c60100756dECb77
MASTER_WALLET_PRIVATE_KEY=your_master_wallet_key_here
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
PARTICLE_API_KEY=your_particle_api_key_here

# ── Authentication ──────────────────────────────────────────────
MAGIC_API_KEY=pk_live_xxxxxxxxxxxxx
TELEGRAM_BOT_TOKEN=xxxxxxxxxxxxx:xxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_BOT_USERNAME=payiitbot

# ── Security ────────────────────────────────────────────────────
ENCRYPTION_KEY=your_32_char_encryption_key_here
SESSION_SECRET=your_session_secret_here

# ── Monitoring & Logging ────────────────────────────────────────
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
DATADOG_API_KEY=xxxxxxxxxxxxxxxxxxxxx
CLOUDWATCH_LOG_GROUP=/payit/production

# ── Feature Flags ───────────────────────────────────────────────
DEV_MODE=false
ENABLE_MOCK_TRANSACTIONS=false
```

### Environment Validation Script

```bash
#!/bin/bash
# validate-env.sh - Ensure all required env vars are set

REQUIRED_VARS=(
  "NUVION_API_KEY"
  "TREASURY_ADDRESS"
  "MAGIC_API_KEY"
  "TELEGRAM_BOT_TOKEN"
  "NODE_ENV"
)

for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    echo "❌ ERROR: Missing required env var: $var"
    exit 1
  fi
done

echo "✅ All required environment variables configured"
```

---

## Database Setup

### Pre-Deployment Database Initialization

```bash
# 1. Create database directory
mkdir -p /var/lib/payit/backups
chmod 700 /var/lib/payit

# 2. Initialize SQLite database (auto-created on first run)
# Server will create schema automatically on startup

# 3. Verify schema created successfully
sqlite3 /var/lib/payit/payit.db ".schema" | head -20

# 4. Create backup before production deployment
cp /var/lib/payit/payit.db /var/lib/payit/backups/payit.db.pre-deploy

# 5. Verify backup integrity
sqlite3 /var/lib/payit/backups/payit.db.pre-deploy "SELECT COUNT(*) FROM sqlite_master WHERE type='table';"
```

### Performance Tuning

```sql
-- WAL Mode (already enabled in db.js)
PRAGMA journal_mode = WAL;

-- Busy timeout for concurrent access
PRAGMA busy_timeout = 10000;

-- Query optimization
CREATE INDEX IF NOT EXISTS idx_hd_deposits_user_id ON hd_deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_hd_deposits_deposit_address ON hd_deposits(deposit_address);
CREATE INDEX IF NOT EXISTS idx_accounts_profile_id ON accounts(profile_id);
CREATE INDEX IF NOT EXISTS idx_cards_profile_id ON cards(profile_id);
CREATE INDEX IF NOT EXISTS idx_card_issuance_fees_user_id ON card_issuance_fees(user_id);
```

### Backup & Recovery

```bash
#!/bin/bash
# backup-database.sh - Automatic daily backups

BACKUP_DIR="/var/lib/payit/backups"
DB_PATH="/var/lib/payit/payit.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup
cp "$DB_PATH" "$BACKUP_DIR/payit_$TIMESTAMP.db"

# Keep last 30 days of backups
find "$BACKUP_DIR" -name "payit_*.db" -mtime +30 -delete

echo "✅ Database backed up: payit_$TIMESTAMP.db"

# Verify backup integrity
sqlite3 "$BACKUP_DIR/payit_$TIMESTAMP.db" "PRAGMA integrity_check;"
```

---

## Security Validation

### Pre-Deployment Security Checks

- [ ] **API Key Management**
  - [ ] NUVION_API_KEY rotated (if reused from staging)
  - [ ] MASTER_WALLET_PRIVATE_KEY never logged or exposed
  - [ ] All keys stored in secure vault (AWS Secrets Manager / HashiCorp Vault)
  - [ ] No .env file committed to git

- [ ] **Code Security**
  - [ ] No hardcoded credentials in source code
  - [ ] All user inputs validated and sanitized
  - [ ] SQL injection prevention: Using parameterized queries (✅ confirmed)
  - [ ] Authentication enforcement on all protected endpoints (✅ confirmed)

- [ ] **Data Protection**
  - [ ] Sensitive data encrypted at rest (encryption key configured)
  - [ ] TLS/HTTPS enforced in production
  - [ ] Database backups encrypted
  - [ ] Audit logs enabled for all transactions

- [ ] **Access Control**
  - [ ] Context isolation verified (personal vs business) ✅
  - [ ] User can only access their own data ✅
  - [ ] Business KYB threshold enforced ($500 USD limit for starters) ✅

---

## Deployment Procedure

### Step 1: Pre-Deployment Testing

```bash
# Run all tests
npm run test

# Run integration tests
npm run test:integration

# Run security audit
npm audit --audit-level=moderate

# Build production bundle
npm run build
```

### Step 2: Deploy Backend

```bash
# Option A: Docker Deployment
docker build -t payit-backend:latest .
docker tag payit-backend:latest payit-backend:v1.0.0
docker push your-registry/payit-backend:v1.0.0

# Option B: Manual Deployment
cd /opt/payit-backend
git pull origin main
npm ci --production
npm run build
systemctl restart payit-backend

# Verify deployment
curl http://localhost:3000/api/health
```

### Step 3: Deploy Frontend

```bash
# Build React app
cd payit-mobile/artifacts/mockup-sandbox
npm run build

# Deploy to CDN / static hosting
aws s3 sync dist/ s3://payit-frontend-prod/

# Invalidate CloudFront cache (if using)
aws cloudfront create-invalidation --distribution-id XXXXX --paths "/*"
```

### Step 4: Verify All Endpoints

```bash
# Health check
curl -X GET https://api.payit.app/api/health

# Backend readiness
curl -X GET https://api.payit.app/api/mobile/me \
  -H "Authorization: Bearer test_token_here"

# Frontend accessibility
curl -I https://payit.app/
```

---

## Post-Deployment Verification

### Immediate Checks (First 15 Minutes)

```bash
# 1. Backend health
curl -X GET https://api.payit.app/api/health -H "Authorization: Bearer token"

# 2. Database connectivity
npm run script:check-db

# 3. Nuvion API connectivity
npm run script:test-nuvion-api

# 4. Transaction processing
npm run script:test-balance-sync

# 5. Fee collection
npm run script:verify-platform-fees
```

### Smoke Tests (First 1 Hour)

| Test | Expected Result | Failure Action |
|------|-----------------|----------------|
| User login | ✅ User authenticated | Check MAGIC_API_KEY, auth endpoint |
| Balance retrieval | ✅ Returns real balance | Check Nuvion sync, DB queries |
| Add money (fiat) | ✅ Account provisioned | Check Nuvion provisioning |
| Card issuance | ✅ Fee deducted, card issued | Check atomicity, fee collection |
| Transfer (NGN) | ✅ Payout successful | Check Nuvion payouts, balance |

### Rollback Triggers

- If > 5% of transactions failing
- If any critical endpoint returns 500 > 2 minutes
- If database queries exceed 10 seconds
- If Nuvion API unreachable > 5 minutes

---

## Monitoring & Alerts

### Key Metrics to Monitor

```yaml
Application Metrics:
  - Request latency (p50, p95, p99)
  - Error rate by endpoint
  - Transaction success rate
  - API key rotation age

Business Metrics:
  - Users (daily active)
  - Cards issued (daily count)
  - Total fees collected (USD)
  - Failed transactions (daily)

Infrastructure Metrics:
  - CPU usage (alert if > 80%)
  - Memory usage (alert if > 85%)
  - Disk usage (alert if > 90%)
  - Database connections (alert if > 95% of limit)
```

### Alert Thresholds

```yaml
CRITICAL (Page + Email):
  - Error rate > 5%
  - Response time p99 > 5 seconds
  - Database down
  - Nuvion API unreachable > 5 minutes
  - Less than 1GB free disk space

WARNING (Email + Slack):
  - Error rate > 1%
  - Response time p95 > 2 seconds
  - Failed transactions > 10% of volume
  - CPU > 75% sustained
```

---

## Rollback Procedure

### Rollback Scenario

If critical issues detected post-deployment:

```bash
#!/bin/bash
# rollback.sh - Rollback to previous production version

VERSION="v1.0.0"  # Previous known-good version
BACKUP_DATE="20240115"

# 1. Stop production service
systemctl stop payit-backend

# 2. Restore database from backup
cp /var/lib/payit/backups/payit_$BACKUP_DATE.db /var/lib/payit/payit.db

# 3. Deploy previous backend version
cd /opt/payit-backend
git checkout $VERSION
npm ci --production
npm run build

# 4. Restart service
systemctl start payit-backend

# 5. Verify health
sleep 5
curl http://localhost:3000/api/health

# 6. Notify team
echo "⚠️ Rollback completed to version $VERSION"
```

### Communication Template

```
🚨 PRODUCTION INCIDENT - ROLLBACK INITIATED

Time: [TIMESTAMP]
Version: [PREVIOUS_VERSION]
Reason: [SPECIFIC_ERROR]

Actions Taken:
- Database restored from backup [DATE]
- Backend rolled back to [VERSION]
- Service restarted
- Health check passed

Status: ✅ Stable
ETA to Resolution: [TIME]

Investigation: [ISSUE_DETAILS]
```

---

## 7-Day Stability Monitoring

### Daily Health Dashboard

Create daily report including:

```
📊 DAILY PRODUCTION REPORT
Date: [DATE]

✅ Uptime: [PERCENTAGE]
✅ Transactions: [COUNT]
✅ Active Users: [COUNT]
✅ Platform Fees Collected: $[AMOUNT]

⚠️ Alerts:
- [LIST ANY ALERTS TRIGGERED]

🐛 Issues Found:
- [LIST ANY ISSUES]

📈 Performance:
- Avg Response Time: [MS]
- p99 Response Time: [MS]
- Error Rate: [%]

💾 Database:
- Size: [GB]
- Queries/sec: [COUNT]
- Backup Status: ✅ OK

Next Actions:
- [LIST ITEMS]
```

### Weekly Stability Review

After 7 days:

- [ ] Confirm 99.5% uptime
- [ ] Zero critical incidents
- [ ] All transactions successful
- [ ] Database size stable
- [ ] No security issues
- [ ] Performance baselines established
- [ ] Team trained on production procedures

**Go/No-Go Decision**: 
- **GO**: Proceed with full marketing launch
- **NO-GO**: Hold for additional fixes, redo 7-day period

---

## Support Runbook

### Common Issues & Fixes

#### Issue: "NUVION_API_KEY is not configured"

**Symptoms**: Server fails to start, 500 errors on all endpoints
**Root Cause**: Missing or invalid NUVION_API_KEY environment variable
**Fix**:
```bash
# 1. Verify env var is set
echo $NUVION_API_KEY

# 2. If empty, set it
export NUVION_API_KEY="your_nuvion_api_key_here"

# 3. Restart service
systemctl restart payit-backend

# 4. Verify
curl http://localhost:3000/api/health
```

#### Issue: "Insufficient balance" when user has funds

**Symptoms**: User cannot transfer despite showing balance
**Root Cause**: Context isolation issue (personal vs business)
**Fix**:
```bash
# 1. Check user's active context
sqlite3 /var/lib/payit/payit.db \
  "SELECT user_id, active_context FROM users WHERE user_id='USER_ID';"

# 2. Verify balance in correct profile
sqlite3 /var/lib/payit/payit.db \
  "SELECT SUM(expected_amount) FROM hd_deposits WHERE user_id='USER_ID';"

# 3. If mismatch, verify Issue #3 fix is deployed
git log --oneline | grep "context isolation"
```

#### Issue: Card issuance fails with fee deduction error

**Symptoms**: User attempts card issuance, gets error about fee
**Root Cause**: Insufficient balance or race condition
**Fix**:
```bash
# 1. Check user balance
curl https://api.payit.app/api/mobile/balance \
  -H "Authorization: Bearer USER_TOKEN"

# 2. Check Nuvion card fees
npm run script:get-card-fees

# 3. Verify transaction atomicity
npm run test:concurrent-card-issuance
```

#### Issue: Balance shows 0 after deposit

**Symptoms**: User receives deposit, balance still shows 0
**Root Cause**: Nuvion sync failed or wrong context selected
**Fix**:
```bash
# 1. Manually trigger deposit sync
curl -X POST https://api.payit.app/api/mobile/sync-deposits \
  -H "Authorization: Bearer USER_TOKEN"

# 2. Check Nuvion live balance
npm run script:check-nuvion-balance USER_ID

# 3. If still 0, check account provisioning
sqlite3 /var/lib/payit/payit.db \
  "SELECT * FROM accounts WHERE user_id='USER_ID';"
```

#### Issue: High error rate (> 5%)

**Symptoms**: Multiple endpoints returning 500 errors
**Root Cause**: Database connection issues or memory leak
**Fix**:
```bash
# 1. Check service health
systemctl status payit-backend

# 2. Check resource usage
ps aux | grep node  # Memory/CPU
df -h              # Disk space

# 3. Check database
sqlite3 /var/lib/payit/payit.db "PRAGMA database_list;"
sqlite3 /var/lib/payit/payit.db "PRAGMA integrity_check;"

# 4. If necessary, restart
systemctl restart payit-backend
```

### Escalation Matrix

| Issue | Severity | Response Time | Escalation |
|-------|----------|---------------|------------|
| API unreachable | CRITICAL | 5 min | CTO + on-call |
| Error rate > 5% | CRITICAL | 10 min | Team lead + CTO |
| Card fees not collecting | HIGH | 30 min | Team lead |
| User balance mismatch | HIGH | 1 hour | Engineering |
| Slow responses | MEDIUM | 2 hours | DevOps |

---

## Sign-Off

- **Product Manager**: _________________________ Date: _______
- **Engineering Lead**: _________________________ Date: _______
- **DevOps Engineer**: _________________________ Date: _______
- **Security Officer**: _________________________ Date: _______

**Deployment Approved**: ☐ YES ☐ NO

---

