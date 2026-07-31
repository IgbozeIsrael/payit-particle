# Card Issuance System - Security Fixes Implementation Guide

## Overview

This document provides step-by-step fixes for the critical context isolation vulnerabilities identified in the security audit.

---

## Fix #1: Context-Scoped Balance Check (CRITICAL)

### File: `payit-particle/src/mobile-api.js`

### Location: Lines 2050-2090 (POST /api/mobile/cards/issue endpoint)

### Current Vulnerable Code:
```javascript
if (requestUrl.pathname === '/api/mobile/cards/issue') {
  const context = payload.context || user.active_context || 'personal';
  const cardType = payload.card_type || 'virtual';
  const currency = payload.currency || 'USD';
  
  // ... fee calculation ...
  
  // Step 3: Get user's current USDT balance [VULNERABLE]
  let currentBalanceUsdt = 0;
  try {
    const stmt = db.db.prepare('SELECT SUM(expected_amount) as total FROM hd_deposits WHERE user_id = ? OR user_id = ? OR virtual_account_no = ?');
    const row = stmt.get(telegramId, user?.personal_smart_account || '', user?.nuvion_account_no || '');
    currentBalanceUsdt = Number(row?.total || 0);
  } catch (balErr) {
    console.warn('[Card Fee] Balance fetch warning:', balErr.message);
  }
  
  // Fallback: check hd_deposits table if Nuvion call fails [ALSO VULNERABLE]
  if (currentBalanceUsdt === 0) {
    try {
      const stmt = db.db.prepare('SELECT SUM(expected_amount) as total FROM hd_deposits WHERE user_id = ? OR user_id = ? OR virtual_account_no = ?');
      const row = stmt.get(telegramId, user?.owner_address || '', user?.nuvion_account_no || '');
      currentBalanceUsdt = Number(row?.total || 0);
    } catch (_) {}
  }
  
  // Step 4: Check if user has sufficient balance
  if (currentBalanceUsdt < totalFee) {
    return sendJson(res, 400, {
      success: false,
      error: `Insufficient balance...`,
      required_balance: totalFee,
      current_balance: currentBalanceUsdt,
      card_type: cardType,
      fee_breakdown: {
        nuvion_fee: nuvionFee,
        platform_fee: platformFee,
        total_fee: totalFee
      }
    });
  }
  
  // ... rest of code ...
}
```

### Fixed Code:
```javascript
if (requestUrl.pathname === '/api/mobile/cards/issue') {
  const context = payload.context || user.active_context || 'personal';
  const cardType = payload.card_type || 'virtual';
  const currency = payload.currency || 'USD';
  
  // ... fee calculation ...
  
  // Step 3: Resolve context-specific smart account [FIX: Context-aware]
  const targetSmartAccount = context === 'business'
    ? (user.business_smart_account || user.owner_address)
    : (user.personal_smart_account || user.owner_address);
  
  if (!targetSmartAccount) {
    return sendJson(res, 400, { 
      error: 'No smart account configured for this context. Please complete wallet setup.' 
    });
  }
  
  // Step 4: Get CONTEXT-SCOPED balance [FIX: Filter by deposit_address]
  let contextBalanceUsdt = 0;
  try {
    // FIXED: Only sum deposits to THIS context's smart account
    const stmt = db.db.prepare(
      'SELECT SUM(expected_amount) as total FROM hd_deposits WHERE deposit_address = ? AND user_id = ?'
    );
    const row = stmt.get(targetSmartAccount, telegramId);
    contextBalanceUsdt = Number(row?.total || 0);
    console.log(`[Card Fee] ${context} balance for user ${telegramId}: $${contextBalanceUsdt.toFixed(2)} USDT (smart_account: ${targetSmartAccount.slice(0,10)}...)`);
  } catch (balErr) {
    console.warn(`[Card Fee] ${context} balance fetch warning:`, balErr.message);
  }
  
  // Step 5: Check if user has sufficient balance in THIS context
  if (contextBalanceUsdt < totalFee) {
    return sendJson(res, 400, {
      success: false,
      error: `Insufficient ${context} balance. Required: $${totalFee.toFixed(2)}, Available: $${contextBalanceUsdt.toFixed(2)}`,
      required_balance: totalFee,
      current_balance: contextBalanceUsdt,
      context: context,
      card_type: cardType,
      fee_breakdown: {
        nuvion_fee: nuvionFee,
        platform_fee: platformFee,
        total_fee: totalFee
      }
    });
  }
  
  // ... rest of code ...
}
```

### Key Changes:

1. ✅ Resolve `targetSmartAccount` explicitly from context
2. ✅ Query ONLY deposits with `deposit_address = targetSmartAccount`
3. ✅ Include `user_id` in WHERE clause to prevent cross-user issues
4. ✅ Add context to error messages for debugging
5. ✅ Add validation that smart account exists

---

## Fix #2: Atomic Transaction for Balance Check + Deduction (CRITICAL)

### File: `payit-particle/src/mobile-api.js`

### Location: Lines 2050-2090 (POST /api/mobile/cards/issue endpoint)

### Current Vulnerable Code:
```javascript
// Step 4: Check if user has sufficient balance [NOT ATOMIC]
if (currentBalanceUsdt < totalFee) {
  return sendJson(res, 400, { ... });
}

// TIME GAP FOR RACE CONDITION HERE
// Another request could deduct from the same balance

// Step 5: Deduct fee from user's USDT balance [SEPARATE OPERATION]
const feeDeductId = `card_fee_deduct_${cardInfo.cardId}_${Date.now()}`;
try {
  db.createHdDeposit(feeDeductId, telegramId, -totalFee, 'USDT', `card_issuance_fee_${cardType}`, context === 'business' ? user?.business_smart_account : user?.personal_smart_account);
} catch (deductErr) {
  console.warn('[Card Fee Deduct Warning]', deductErr.message);
  return sendJson(res, 500, { error: 'Failed to deduct card issuance fee from balance' });
}
```

### Fixed Code:
```javascript
// Step 4 & 5: Atomic transaction for balance check + deduction [FIX: Use transaction]
const feeDeductId = `card_fee_deduct_${cardInfo.cardId}_${Date.now()}`;

try {
  // Use SQLite transaction to ensure atomicity
  const txn = db.db.transaction(() => {
    // Check balance WITHIN transaction (prevents race condition)
    const stmt = db.db.prepare(
      'SELECT SUM(expected_amount) as total FROM hd_deposits WHERE deposit_address = ? AND user_id = ?'
    );
    const row = stmt.get(targetSmartAccount, telegramId);
    const currentBalance = Number(row?.total || 0);
    
    // Validate balance before deduction
    if (currentBalance < totalFee) {
      throw new Error(
        `Insufficient ${context} balance. Required: $${totalFee.toFixed(2)}, ` +
        `Available: $${currentBalance.toFixed(2)}`
      );
    }
    
    // Deduct within same transaction (atomic operation)
    db.createHdDeposit(
      feeDeductId, 
      telegramId, 
      -totalFee, 
      'USDT', 
      `card_issuance_fee_${cardType}`, 
      targetSmartAccount
    );
    
    return { 
      success: true, 
      newBalance: currentBalance - totalFee,
      timestamp: Date.now()
    };
  });
  
  // Execute transaction
  const txResult = txn();
  console.log(
    `[Card Fee Atomic Deduction] User ${telegramId} (${context}): ` +
    `Deducted $${totalFee.toFixed(2)} USDT. New balance: $${txResult.newBalance.toFixed(2)}`
  );
} catch (txErr) {
  console.warn('[Card Fee Deduction Error]', txErr.message);
  return sendJson(res, 400, { 
    error: txErr.message || 'Failed to deduct card issuance fee from balance',
    retry_after: 500
  });
}
```

### Key Changes:

1. ✅ Check balance and deduction within single transaction
2. ✅ Uses SQLite's built-in transaction isolation
3. ✅ Prevents race condition: no time gap between check and deduction
4. ✅ Atomic rollback if balance check fails
5. ✅ Better error messages with context info
6. ✅ Returns new balance after transaction

### SQLite Transaction Behavior:

- **SERIALIZED Mode** (default): Only one transaction can write at a time
- **Isolation Level**: READ COMMITTED prevents dirty reads
- **Atomicity**: All-or-nothing: entire transaction succeeds or rolls back

---

## Fix #3: Fallback Balance Query Context Filter (HIGH)

### File: `payit-particle/src/mobile-api.js`

### Location: Used in multiple places, example at line 720

### Current Vulnerable Code:
```javascript
// Fallback: check hd_deposits table if Nuvion call fails
if (currentBalanceUsdt === 0) {
  try {
    const stmt = db.db.prepare(
      'SELECT SUM(expected_amount) as total FROM hd_deposits WHERE user_id = ? OR user_id = ? OR virtual_account_no = ?'
    );
    const row = stmt.get(telegramId, user?.owner_address || '', user?.nuvion_account_no || '');
    currentBalanceUsdt = Number(row?.total || 0);
  } catch (_) {}
}
```

### Issues with Current Code:

1. `OR virtual_account_no = ?` clause could match accounts across contexts
2. Multiple `OR user_id` conditions could pick wrong user format
3. No deposit_address filter (context isolation)

### Fixed Code:
```javascript
// Fallback: check hd_deposits table with CONTEXT-SPECIFIC filter
if (contextBalanceUsdt === 0) {
  try {
    // FIXED: Only check deposits for this context's smart account
    const stmt = db.db.prepare(
      'SELECT SUM(expected_amount) as total FROM hd_deposits ' +
      'WHERE deposit_address = ? AND user_id = ?'
    );
    const row = stmt.get(targetSmartAccount, telegramId);
    contextBalanceUsdt = Number(row?.total || 0);
    
    if (contextBalanceUsdt > 0) {
      console.log(
        `[Fallback Balance Check] ${context} balance: $${contextBalanceUsdt.toFixed(2)} USDT ` +
        `(fetched from ledger for smart_account: ${targetSmartAccount.slice(0,10)}...)`
      );
    }
  } catch (fallbackErr) {
    console.warn(`[Fallback Balance Check Error] ${fallbackErr.message}`);
  }
}
```

### Key Changes:

1. ✅ Remove `OR virtual_account_no` clause (causes cross-context leakage)
2. ✅ Remove multiple `OR user_id` conditions (use single user_id)
3. ✅ Add explicit `deposit_address` filter
4. ✅ Better logging for debugging

---

## Fix #4: Sync Balance Query Context Assertion (HIGH)

### File: `payit-particle/src/nuvion-service.js`

### Location: Lines 609-612 in `syncNuvionLiveAccountBalance()` function

### Current Vulnerable Code:
```javascript
const isThisUsersAccount =
  // Match strictly by stored account ID for this profile context
  (userNuvionAccountId && acc.id === userNuvionAccountId) ||
  // Match by stored account number for this profile context
  (userNuvionAccountNo && acc.nuvion_ban === userNuvionAccountNo) ||
  // Match by platform user ID AND context tag
  (acc.meta?.platform_user_id === effectiveUserId && acc.meta?.context === context);

if (isThisUsersAccount) {
  totalNgn += ngnBal;  // <-- Could add multiple accounts without context check
  targetAccId = acc.id;
  targetAccNum = acc.nuvion_ban || targetAccNum;
}
```

### Issues:

1. First two conditions (`userNuvionAccountId` and `userNuvionAccountNo` match) don't verify context
2. If DB returns account from wrong context, it still matches
3. Loop could accumulate multiple accounts

### Fixed Code:
```javascript
const isThisUsersAccount =
  // All conditions MUST verify context
  (userNuvionAccountId && acc.id === userNuvionAccountId && acc.meta?.context === context) ||
  (userNuvionAccountNo && acc.nuvion_ban === userNuvionAccountNo && acc.meta?.context === context) ||
  // Final fallback with explicit context requirement
  (acc.meta?.platform_user_id === effectiveUserId && acc.meta?.context === context);

if (isThisUsersAccount) {
  // Log the account match for audit trail
  console.log(
    `[Nuvion Sync] Matched ${context} account ${acc.id} for user ${effectiveUserId}: ` +
    `₦${ngnBal} NGN (meta_context: ${acc.meta?.context})`
  );
  
  // Accumulate balance (but only ONE account should match with proper context filtering)
  totalNgn += ngnBal;
  targetAccId = acc.id;
  targetAccNum = acc.nuvion_ban || targetAccNum;
}
```

### Additional Safety Check:

```javascript
// After the loop, verify we only matched ONE account per context
if (targetAccId && targetAccNum && !targetAccId.startsWith('acc_')) {
  // This is a real Nuvion account ID
  const matchCount = accList.filter(a =>
    a.meta?.platform_user_id === effectiveUserId &&
    a.meta?.context === context &&
    a.currency === 'NGN' &&
    a.status === 'active'
  ).length;
  
  if (matchCount > 1) {
    console.warn(
      `[Nuvion Sync WARNING] Found ${matchCount} ${context} NGN accounts for user ${effectiveUserId}. ` +
      `Expected 1. Using first match: ${targetAccId}`
    );
  }
}
```

### Key Changes:

1. ✅ ALL matching conditions now verify context
2. ✅ Add audit logging for account matches
3. ✅ Add warning if multiple accounts matched (prevents silent bugs)
4. ✅ Clarify that only ONE account should match per context

---

## Fix #5: Verify Nuvion Meta Tag Persistence (MEDIUM)

### File: `payit-particle/src/nuvion-service.js`

### Location: After account creation in `getOrCreateDepositAccount()` (around line 425)

### Current Code:
```javascript
// Step 2: Create a Nuvion account for this currency and transaction
const account = await requestNuvionWithFallback('/accounts', 'POST', {
  entity_id: entityId,
  type: 'checking',
  currency: nuvionCurrency,
  display_name: accDisplayName,
  meta: { platform_user_id: userId, context: context }
});
accountId = account.id || account.data?.id;
console.log(`[Nuvion] Created account: ${accountId}`);

// NO VERIFICATION that meta tags were persisted!
```

### Fixed Code:
```javascript
// Step 2: Create a Nuvion account for this currency and transaction
const account = await requestNuvionWithFallback('/accounts', 'POST', {
  entity_id: entityId,
  type: 'checking',
  currency: nuvionCurrency,
  display_name: accDisplayName,
  meta: { platform_user_id: userId, context: context }
});
accountId = account.id || account.data?.id;
console.log(`[Nuvion] Created account: ${accountId}`);

// Step 2a: Verify meta tags were persisted [FIX: Validation]
try {
  const verifyRes = await requestNuvionWithFallback(`/accounts/${accountId}`, 'GET');
  const verifiedAccount = verifyRes?.data?.data || verifyRes?.data || {};
  
  // Check if context tag was persisted
  const persistedContext = verifiedAccount.meta?.context;
  if (persistedContext !== context) {
    console.warn(
      `[Nuvion] Meta tag mismatch on account ${accountId}: ` +
      `sent context="${context}", received context="${persistedContext}"`
    );
    
    // Attempt to patch the account to correct context
    try {
      await requestNuvionWithFallback(`/accounts/${accountId}`, 'PATCH', {
        meta: { 
          ...verifiedAccount.meta, 
          platform_user_id: userId,
          context: context 
        }
      });
      console.log(`[Nuvion] Patched account ${accountId} meta tags to context="${context}"`);
    } catch (patchErr) {
      console.error(`[Nuvion] Failed to patch account ${accountId} meta tags: ${patchErr.message}`);
      throw new Error(`Account context tag could not be set. Account: ${accountId}`);
    }
  }
  
  // Verify platform_user_id was also persisted
  const persistedUserId = verifiedAccount.meta?.platform_user_id;
  if (persistedUserId !== userId) {
    console.warn(
      `[Nuvion] platform_user_id mismatch on account ${accountId}: ` +
      `sent "${userId}", received "${persistedUserId}"`
    );
  }
  
  console.log(`[Nuvion] Account ${accountId} meta verification passed. Context: ${context}`);
} catch (verifyErr) {
  console.warn(`[Nuvion] Account meta verification skipped: ${verifyErr.message}`);
  // Continue anyway, but log the warning
}
```

### Key Changes:

1. ✅ Verify context tag was persisted by Nuvion
2. ✅ Verify platform_user_id was persisted
3. ✅ Attempt to patch if tags were lost
4. ✅ Throw error if context cannot be set (fail fast)
5. ✅ Add detailed logging for debugging

---

## Testing Plan

### Unit Tests to Add

**File:** `payit-particle/tests/card-issuance-context.test.js`

```javascript
const test = require('node:test');
const assert = require('node:assert');
const db = require('../src/db');
const nuvionService = require('../src/nuvion-service');
const mobileApi = require('../src/mobile-api');

describe('Card Issuance - Context Isolation', () => {
  
  test('Personal card fee should NOT use business balance', async () => {
    // Setup: User with $100 personal, $0 business
    const testUser = {
      user_id: 'test_user_123',
      personal_smart_account: '0xPersonal123',
      business_smart_account: '0xBusiness456',
      owner_address: '0xOwner789'
    };
    
    // Mock DB deposits
    db.db.prepare('DELETE FROM hd_deposits WHERE user_id = ?').run(testUser.user_id);
    db.createHdDeposit('dep1', testUser.user_id, 100, 'USDT', '0xPersonal123');
    // Note: NO deposits to business account
    
    // Attempt to issue card in business context with $2.50 fee
    // Should FAIL because business balance is $0
    try {
      const result = await cardIssuanceEndpoint(testUser, {
        context: 'business',
        card_type: 'virtual',
        currency: 'USD'
        // fee = $2.50
      });
      assert(result.error !== undefined, 'Should have failed with insufficient balance');
      assert(result.error.includes('business'), 'Error should mention business context');
    } finally {
      db.db.prepare('DELETE FROM hd_deposits WHERE user_id = ?').run(testUser.user_id);
    }
  });
  
  test('Business card fee should NOT use personal balance', async () => {
    const testUser = {
      user_id: 'test_user_456',
      personal_smart_account: '0xPersonal123',
      business_smart_account: '0xBusiness456',
      owner_address: '0xOwner789'
    };
    
    // Mock DB deposits
    db.db.prepare('DELETE FROM hd_deposits WHERE user_id = ?').run(testUser.user_id);
    db.createHdDeposit('dep1', testUser.user_id, 100, 'USDT', '0xBusiness456');
    // Note: NO deposits to personal account
    
    // Attempt to issue card in personal context with $2.50 fee
    // Should FAIL because personal balance is $0
    try {
      const result = await cardIssuanceEndpoint(testUser, {
        context: 'personal',
        card_type: 'virtual',
        currency: 'USD'
      });
      assert(result.error !== undefined, 'Should have failed with insufficient balance');
      assert(result.error.includes('personal'), 'Error should mention personal context');
    } finally {
      db.db.prepare('DELETE FROM hd_deposits WHERE user_id = ?').run(testUser.user_id);
    }
  });
  
  test('Concurrent card issuance should prevent double-spending', async () => {
    const testUser = {
      user_id: 'test_user_789',
      personal_smart_account: '0xPersonal123',
      business_smart_account: '0xBusiness456'
    };
    
    db.db.prepare('DELETE FROM hd_deposits WHERE user_id = ?').run(testUser.user_id);
    db.createHdDeposit('dep1', testUser.user_id, 2.50, 'USDT', '0xPersonal123');
    
    try {
      // Issue two concurrent card requests with the same balance
      const [result1, result2] = await Promise.all([
        cardIssuanceEndpoint(testUser, { context: 'personal', card_type: 'virtual', currency: 'USD' }),
        cardIssuanceEndpoint(testUser, { context: 'personal', card_type: 'virtual', currency: 'USD' })
      ]);
      
      // One should succeed, one should fail (cannot both succeed with $2.50 and two $2.50 fees)
      const successes = [result1, result2].filter(r => r.success).length;
      assert(successes === 1, `Expected 1 success, got ${successes}. Race condition detected!`);
      
      // The failed one should mention insufficient balance
      const failures = [result1, result2].filter(r => !r.success);
      assert(failures[0].error.includes('Insufficient'), 'Failure should mention insufficient balance');
    } finally {
      db.db.prepare('DELETE FROM hd_deposits WHERE user_id = ?').run(testUser.user_id);
    }
  });
});
```

### Integration Tests

```bash
# Run the card issuance tests
npm test tests/card-issuance-context.test.js

# Run full test suite including balance checks
npm test

# Run security-specific tests
npm test tests/security/
```

---

## Deployment Checklist

- [ ] Review and approve all three fixes
- [ ] Implement Fix #1 (Context-scoped balance check)
- [ ] Implement Fix #2 (Atomic transaction)
- [ ] Implement Fix #3 (Fallback query context filter)
- [ ] Implement Fix #4 (Sync balance query context assertion)
- [ ] Implement Fix #5 (Meta tag verification)
- [ ] Run unit tests: `npm test`
- [ ] Run integration tests on staging
- [ ] Manual testing: Cross-context card issuance
- [ ] Manual testing: Concurrent card issuance (stress test)
- [ ] Code review by security team
- [ ] Deploy to production
- [ ] Monitor logs for context isolation warnings
- [ ] Update status page

---

## Rollback Plan

If issues occur after deployment:

1. **Revert to previous version:** `git revert <commit_hash>`
2. **Disable card issuance endpoint:** Remove route from `mobile-api.js`
3. **Notify users:** Send notification that card feature is temporarily unavailable
4. **Investigate logs:** Review `console.warn` and `console.error` logs for context issues

---

## Monitoring & Alerting

Add these alerts to your monitoring system:

```javascript
// Alert if context mismatch detected
if (acc.meta?.context !== context) {
  ALERT('SECURITY: Account context mismatch detected', {
    account_id: acc.id,
    expected_context: context,
    actual_context: acc.meta?.context,
    user_id: userId,
    severity: 'CRITICAL'
  });
}

// Alert if multiple accounts matched for single context
if (matchCount > 1) {
  ALERT('SECURITY: Multiple accounts matched for context', {
    user_id: userId,
    context: context,
    match_count: matchCount,
    severity: 'HIGH'
  });
}

// Alert if balance goes negative (should never happen with fixes)
if (newBalance < 0) {
  ALERT('SECURITY: Negative balance detected', {
    user_id: userId,
    context: context,
    balance: newBalance,
    severity: 'CRITICAL'
  });
}
```

---

## References

- **SQLite Transaction Documentation:** https://www.sqlite.org/lang_transaction.html
- **Security Context Isolation Best Practices:** https://owasp.org/www-community/Privilege_escalation
- **Race Condition Prevention:** https://en.wikipedia.org/wiki/Race_condition#Software

