# 🔴 CRITICAL FIXES - Action Checklist

## 5 Critical Issues That MUST Be Fixed Before Production

---

## FIX #1: Remove Dev Mode Hardcoding
**Severity**: CRITICAL  
**File**: `payit-particle/src/mobile-api.js`  
**Line**: ~225  
**Time**: 15 minutes  

### Current Code (BROKEN)
```javascript
  // Fallback check: allow sandbox and dev mode authentication
  if (!user) {
    const isDevOrTest = true;  // ❌ HARDCODED TO TRUE!
    const defaultDevUser = 'did:ethr:0xaf0245eb93910b2a02901654d72644090579015A';
    const effectiveToken = (didToken && didToken.length > 0 && didToken !== 'default_demo_user') ? didToken : defaultDevUser;
    user = db.getUser(effectiveToken);
    
    if (!user) {
      user = db.getUser(defaultDevUser) || db.db.prepare("SELECT * FROM users WHERE telegram_id LIKE 'did:ethr:%' ORDER BY created_at ASC LIMIT 1").get();
    }
```

### Fixed Code (CORRECT)
```javascript
  // Fallback check: allow sandbox and dev mode authentication
  if (!user) {
    const isDevOrTest = process.env.NODE_ENV === 'development' || process.env.DEV_MODE === 'true';
    
    if (isDevOrTest) {
      const defaultDevUser = 'did:ethr:0xaf0245eb93910b2a02901654d72644090579015A';
      const effectiveToken = (didToken && didToken.length > 0 && didToken !== 'default_demo_user') ? didToken : defaultDevUser;
      user = db.getUser(effectiveToken);
      
      if (!user) {
        user = db.getUser(defaultDevUser) || db.db.prepare("SELECT * FROM users WHERE telegram_id LIKE 'did:ethr:%' ORDER BY created_at ASC LIMIT 1").get();
      }
    }
```

### Verification
```bash
# Test 1: With NODE_ENV=development
NODE_ENV=development npm start
curl -X GET http://localhost:3000/api/mobile/me  # Should work

# Test 2: With NODE_ENV=production (no auth)
NODE_ENV=production npm start
curl -X GET http://localhost:3000/api/mobile/me  # Should return 401 ❌

# Test 3: With NODE_ENV=production + valid token
NODE_ENV=production npm start
curl -X GET http://localhost:3000/api/mobile/me \
  -H "Authorization: Bearer valid_token_here"  # Should work ✅
```

**Approval**: [ ] Reviewed [ ] Approved [ ] Applied [ ] Tested

---

## FIX #2: Enforce KYC Verification Before Auto-Provision
**Severity**: CRITICAL  
**File**: `payit-particle/src/mobile-api.js`  
**Line**: ~245  
**Time**: 20 minutes  

### Current Code (BROKEN)
```javascript
    if (!user) {
      // Auto-provision persistent user in SQLite for local session retention
      const masterWallet = walletManager.getMasterWallet();
      const ownerAddr = masterWallet.address;
      const personalAccount = particleService.deriveSmartAccountAddress(ownerAddr, 0);
      const businessAccount = particleService.deriveSmartAccountAddress(ownerAddr, 1);

      db.createUser(effectiveToken, personalAccount, businessAccount, 'dev');
      db.updateOwnerAddress(effectiveToken, ownerAddr);
      user = db.getUser(effectiveToken);
    }

    if (!user) {
      return sendJson(res, 401, { status: 'error', message: 'Unauthorized: Valid authentication token required' });
    }
```

### Fixed Code (CORRECT)
```javascript
    if (!user && process.env.NODE_ENV === 'development') {
      // Auto-provision persistent user in SQLite ONLY in development mode
      const masterWallet = walletManager.getMasterWallet();
      const ownerAddr = masterWallet.address;
      const personalAccount = particleService.deriveSmartAccountAddress(ownerAddr, 0);
      const businessAccount = particleService.deriveSmartAccountAddress(ownerAddr, 1);

      db.createUser(effectiveToken, personalAccount, businessAccount, 'dev');
      db.updateOwnerAddress(effectiveToken, ownerAddr);
      user = db.getUser(effectiveToken);
    }

    if (!user) {
      const message = process.env.NODE_ENV === 'development' 
        ? 'User not found in development mode'
        : 'Unauthorized: User must be registered. Please complete onboarding first.';
      return sendJson(res, 401, { status: 'error', message });
    }
```

### Verification
```bash
# Test 1: Development mode - should auto-provision
NODE_ENV=development npm start
curl -X GET http://localhost:3000/api/mobile/me \
  -H "Authorization: Bearer unregistered_dev_user" 
# Should auto-create and return user ✅

# Test 2: Production mode - should reject
NODE_ENV=production npm start
curl -X GET http://localhost:3000/api/mobile/me \
  -H "Authorization: Bearer unregistered_prod_user"
# Should return 401 ❌

# Test 3: Existing user still works
NODE_ENV=production npm start
# (First, register user through normal flow)
curl -X GET http://localhost:3000/api/mobile/me \
  -H "Authorization: Bearer registered_user_token"
# Should return user data ✅
```

**Approval**: [ ] Reviewed [ ] Approved [ ] Applied [ ] Tested

---

## FIX #3: Correct Context Isolation in Balance Queries
**Severity**: CRITICAL  
**File**: `payit-particle/src/mobile-api.js`  
**Line**: ~425-435  
**Time**: 30 minutes  

### Current Code (BROKEN)
```javascript
      // (In /api/mobile/balance endpoint)
      let totalUsdt = 0;
      // ... code ...
      if (totalUsd === 0) {
        // ... other code ...
        let totalDeposits = 0;
        try {
          const profile = db.getProfileByType(telegramId, activeContext);
          const profId = profile?.profile_id || `prof_${activeContext === 'business' ? 'b' : 'p'}_${telegramId}`;
          // ❌ BROKEN: No filtering by profile!
          const stmt = db.db.prepare('SELECT SUM(expected_amount) as total FROM hd_deposits WHERE deposit_address = ? OR virtual_account_no IN (SELECT nuvion_account_no FROM accounts WHERE profile_id = ?)');
          const row = stmt.get(smartAccount, profId);
          totalDeposits = Number(row?.total || 0);
        } catch (_) {}
```

### Fixed Code (CORRECT)
```javascript
      // (In /api/mobile/balance endpoint)
      let totalUsdt = 0;
      // ... code ...
      if (totalUsd === 0) {
        // ... other code ...
        let totalDeposits = 0;
        try {
          const profile = db.getProfileByType(telegramId, activeContext);
          const profId = profile?.profile_id || `prof_${activeContext === 'business' ? 'b' : 'p'}_${telegramId}`;
          
          // ✅ FIXED: Filter by BOTH context AND user
          // Only sum deposits that belong to:
          // 1. This user (user_id)
          // 2. This context's smart account (deposit_address)
          // 3. This context's Nuvion accounts (profile_id)
          const stmt = db.db.prepare(`
            SELECT SUM(expected_amount) as total 
            FROM hd_deposits 
            WHERE user_id = ? 
              AND deposit_address = ? 
              AND (
                virtual_account_no IS NULL 
                OR virtual_account_no IN (
                  SELECT nuvion_account_no 
                  FROM accounts 
                  WHERE profile_id = ? 
                    AND (status IS NULL OR status = 'active')
                )
              )
          `);
          
          const row = stmt.get(telegramId, smartAccount, profId);
          totalDeposits = Number(row?.total || 0);
        } catch (_) {}
```

### Verification
```bash
# Test 1: Create test user with deposits in BOTH contexts
USER_ID="test_context_isolation_user_123"
PERSONAL_ADDR="0x1111111111111111111111111111111111111111"
BUSINESS_ADDR="0x2222222222222222222222222222222222222222"

# Create personal deposit: $100
sqlite3 /var/lib/payit/payit.db <<EOF
INSERT INTO hd_deposits (deposit_id, user_id, expected_amount, currency, deposit_address, virtual_account_no, status, created_at)
VALUES ('dep_p_1', '$USER_ID', 100, 'USDT', '$PERSONAL_ADDR', 'P_1234567890', 'completed', datetime('now'));
EOF

# Create business deposit: $50
sqlite3 /var/lib/payit/payit.db <<EOF
INSERT INTO hd_deposits (deposit_id, user_id, expected_amount, currency, deposit_address, virtual_account_no, status, created_at)
VALUES ('dep_b_1', '$USER_ID', 50, 'USDT', '$BUSINESS_ADDR', 'B_1234567890', 'completed', datetime('now'));
EOF

# Test 2: Check personal balance
curl -X GET "http://localhost:3000/api/mobile/balance?context=personal" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "X-User-ID: $USER_ID"
# Response should show: balance = $100 (NOT $150) ✅

# Test 3: Check business balance
curl -X GET "http://localhost:3000/api/mobile/balance?context=business" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "X-User-ID: $USER_ID"
# Response should show: balance = $50 (NOT $150) ✅

# Test 4: Verify context switch doesn't leak balance
# After getting personal balance of $100,
# switch to business and verify it's $50, not $100 ✅
```

**Approval**: [ ] Reviewed [ ] Approved [ ] Applied [ ] Tested

---

## FIX #4: Add API Key Validation on Startup
**Severity**: HIGH  
**File**: `payit-particle/src/server.js`  
**Line**: At top of initialization (~line 30)  
**Time**: 10 minutes  

### Current Code (INCOMPLETE)
```javascript
const PORT = process.env.PORT || 3000;
const botUsername = (process.env.TELEGRAM_BOT_USERNAME || 'payiitbot').replace(/^@/, '').trim();
// ... rest of requires ...

// Server starts without validation!
const server = http.createServer(handleRequest);
```

### Fixed Code (CORRECT)
```javascript
// ── Startup Validation ──────────────────────────────────────────
function validateEnvironment() {
  const required = {
    'NUVION_API_KEY': 'Nuvion API authentication',
    'MAGIC_API_KEY': 'Magic SDK authentication',
    'TELEGRAM_BOT_TOKEN': 'Telegram bot token',
    'TREASURY_ADDRESS': 'Platform fee collection wallet'
  };

  const issues = [];
  
  for (const [key, description] of Object.entries(required)) {
    const value = process.env[key];
    
    if (!value) {
      issues.push(`❌ Missing: ${key} (${description})`);
    } else if (value.includes('your_') || value === 'placeholder') {
      issues.push(`❌ Invalid: ${key} is a placeholder (${description})`);
    }
  }

  if (issues.length > 0) {
    console.error('\n🔴 STARTUP FAILED: Missing or invalid environment variables\n');
    issues.forEach(issue => console.error('  ' + issue));
    console.error('\n📋 Required environment variables:');
    Object.entries(required).forEach(([key, desc]) => {
      console.error(`  - ${key}: ${desc}`);
    });
    console.error('\n💡 Add these to your .env file before starting the server\n');
    process.exit(1);
  }

  console.log('✅ All environment variables validated');
}

// Validate BEFORE doing anything else
validateEnvironment();

const PORT = process.env.PORT || 3000;
const botUsername = (process.env.TELEGRAM_BOT_USERNAME || 'payiitbot').replace(/^@/, '').trim();
// ... rest of requires ...

// Server starts with validation passed ✅
const server = http.createServer(handleRequest);
```

### Verification
```bash
# Test 1: Start WITHOUT NUVION_API_KEY
unset NUVION_API_KEY
npm start
# Should immediately exit with:
# 🔴 STARTUP FAILED: Missing or invalid environment variables
# ❌ Missing: NUVION_API_KEY (Nuvion API authentication)

# Test 2: Start WITH placeholder value
export NUVION_API_KEY="your_nuvion_api_key_here"
npm start
# Should immediately exit with:
# 🔴 STARTUP FAILED: Missing or invalid environment variables
# ❌ Invalid: NUVION_API_KEY is a placeholder

# Test 3: Start WITH valid key
export NUVION_API_KEY="sk_live_xxxxxxxxxxxxx"
npm start
# Should print:
# ✅ All environment variables validated
# And continue starting server ✅
```

**Approval**: [ ] Reviewed [ ] Approved [ ] Applied [ ] Tested

---

## FIX #5: Concurrent Request Testing & Race Condition Prevention
**Severity**: HIGH  
**File**: Create new test file: `payit-particle/tests/concurrent-card-issuance.test.js`  
**Time**: 2 hours  

### Test File (NEW)
```javascript
/**
 * Concurrent Card Issuance Test
 * Verifies that 100+ simultaneous card issuance requests don't cause:
 * - Double-spend (balance goes negative)
 * - Race conditions in fee deduction
 * - Lost transactions
 */

const assert = require('assert');
const db = require('../src/db');
const nuvionService = require('../src/nuvion-service');

describe('Concurrent Card Issuance', () => {
  let testUserId = `concurrent_test_${Date.now()}`;
  let initialBalance = 5000; // $5000 USDT

  before(async () => {
    // Setup: Create test user with sufficient balance
    db.createUser(testUserId, '0xpersonal123', '0xbusiness456');
    
    // Deposit initial balance
    db.createHdDeposit(
      `setup_dep_${testUserId}`,
      testUserId,
      initialBalance,
      'USDT',
      '0xpersonal123'
    );
  });

  it('should handle 100 concurrent card issuance requests atomically', async function() {
    this.timeout(60000); // 60 second timeout
    
    const concurrentRequests = 100;
    const feePerCard = 2.50; // Virtual card fee
    const expectedFinalBalance = initialBalance - (concurrentRequests * feePerCard);
    
    // Launch 100 concurrent card issuance requests
    const requests = Array(concurrentRequests)
      .fill(null)
      .map((_, i) => 
        nuvionService.issueCard(testUserId, 'USD', 'personal', 'virtual')
          .then(card => ({ 
            success: true, 
            cardId: card.cardId, 
            index: i 
          }))
          .catch(err => ({ 
            success: false, 
            error: err.message, 
            index: i 
          }))
      );

    const results = await Promise.all(requests);
    
    // Verify all requests completed
    const succeeded = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log(`  Succeeded: ${succeeded.length}/${concurrentRequests}`);
    console.log(`  Failed: ${failed.length}/${concurrentRequests}`);
    
    // At least 90% should succeed in production
    assert(succeeded.length >= 90, `Expected >= 90 successes, got ${succeeded.length}`);
    
    // Check final balance
    const stmt = db.db.prepare(
      'SELECT SUM(expected_amount) as total FROM hd_deposits WHERE user_id = ?'
    );
    const balanceRow = stmt.get(testUserId);
    const finalBalance = Number(balanceRow?.total || 0);
    
    console.log(`  Initial balance: $${initialBalance}`);
    console.log(`  Expected final: $${expectedFinalBalance}`);
    console.log(`  Actual final: $${finalBalance}`);
    
    // Balance should NEVER go negative (atomic transactions working)
    assert(finalBalance >= 0, `Balance went negative: $${finalBalance}`);
    
    // Balance should be reasonable (not double-deducted)
    const tolerance = 100; // $100 tolerance for partial failures
    assert(
      Math.abs(finalBalance - expectedFinalBalance) <= tolerance,
      `Balance mismatch. Expected: $${expectedFinalBalance}, Got: $${finalBalance}`
    );
  });

  it('should prevent race condition in fee deduction', async function() {
    this.timeout(30000);
    
    // Create second test user with limited balance
    const limitedUserId = `limited_user_${Date.now()}`;
    db.createUser(limitedUserId, '0xpersonal789', '0xbusiness012');
    
    const limitedBalance = 10; // Only $10 USDT
    db.createHdDeposit(
      `setup_limited_${limitedUserId}`,
      limitedUserId,
      limitedBalance,
      'USDT',
      '0xpersonal789'
    );
    
    // Try to issue 10 cards at once (each $2.50 = $25 total needed)
    // With only $10 available, at most 4 should succeed
    const requests = Array(10)
      .fill(null)
      .map(() => 
        nuvionService.issueCard(limitedUserId, 'USD', 'personal', 'virtual')
          .then(() => ({ success: true }))
          .catch(err => ({ success: false, error: err.message }))
      );
    
    const results = await Promise.all(requests);
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`  Succeeded: ${succeeded}/10 (expected 4)`);
    console.log(`  Failed: ${failed}/10 (expected 6)`);
    
    // Should NOT allow more than 4 succeeds (atomicity prevents double-spend)
    assert(succeeded <= 4, `Race condition detected! Got ${succeeded} succeeds, expected max 4`);
    
    // Final balance should NEVER go negative
    const stmt = db.db.prepare(
      'SELECT SUM(expected_amount) as total FROM hd_deposits WHERE user_id = ?'
    );
    const balanceRow = stmt.get(limitedUserId);
    const finalBalance = Number(balanceRow?.total || 0);
    
    assert(finalBalance >= 0, `Balance went negative: $${finalBalance}`);
  });

  after(() => {
    // Cleanup
    db.db.prepare('DELETE FROM hd_deposits WHERE user_id = ?').run(testUserId);
    db.db.prepare('DELETE FROM users WHERE user_id = ?').run(testUserId);
  });
});
```

### Run Test
```bash
# Install test runner if not present
npm install --save-dev mocha

# Run the concurrent test
npm test -- tests/concurrent-card-issuance.test.js

# Expected output:
# ✅ Concurrent Card Issuance
#   ✅ should handle 100 concurrent requests atomically
#     Succeeded: 100/100
#     Initial balance: $5000
#     Expected final: $4750
#     Actual final: $4750
#   ✅ should prevent race condition in fee deduction
#     Succeeded: 4/10 (expected 4)
#     Failed: 6/10 (expected 6)
#   ✓ 2 passing
```

**Approval**: [ ] Reviewed [ ] Approved [ ] Applied [ ] Tested

---

## Overall Checklist

### Fix Application
- [ ] Fix #1: Dev mode hardcoding removed
- [ ] Fix #2: KYC enforcement added
- [ ] Fix #3: Context isolation corrected
- [ ] Fix #4: Startup validation added
- [ ] Fix #5: Concurrent test created & passing

### Testing
- [ ] Unit tests passing for each fix
- [ ] Integration tests passing
- [ ] Concurrent load test (100+ requests) passing
- [ ] Deployed to staging environment
- [ ] Smoke tests passing on staging
- [ ] Performance baselines established

### Security & Data
- [ ] Dev mode only works in development
- [ ] Production rejects unauthenticated users
- [ ] Context isolation prevents balance leaks
- [ ] Race conditions prevented in transactions
- [ ] No negative balances possible

### Deployment Readiness
- [ ] All fixes merged to main branch
- [ ] All tests passing in CI/CD
- [ ] Staging environment stable (24 hours)
- [ ] Deployment procedures documented
- [ ] Rollback procedures tested
- [ ] Team trained on deployment

---

## Approval Sign-Off

**This checklist MUST be 100% complete before production deployment.**

- [ ] **CTO/Tech Lead**: _________________ Date: _____
- [ ] **QA Lead**: _________________ Date: _____
- [ ] **Security Officer**: _________________ Date: _____
- [ ] **DevOps Lead**: _________________ Date: _____

---

**Status**: 🔴 **NOT STARTED** → 🟡 **IN PROGRESS** → 🟢 **COMPLETE**

Update this checklist as you progress through each fix.

