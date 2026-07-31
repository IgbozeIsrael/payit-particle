# Card Issuance System Security Audit Report
## Context Isolation & Fee Deduction Analysis

**Audit Date:** 2024  
**Scope:** Card issuance endpoint, context isolation, personal/business balance separation, fee deduction logic  
**Severity Levels:** 🔴 CRITICAL | 🟠 HIGH | 🟡 MEDIUM | 🟢 LOW | ✅ PASS

---

## Executive Summary

The card issuance system has **CRITICAL context isolation vulnerabilities** that could allow personal users to issue cards using business balance (or vice versa). Additionally, there are **balance checking issues** where the wrong context's balance could be checked, and a **potential race condition** in fee deduction logic.

**Critical Vulnerabilities Found:** 2  
**High Severity Issues:** 2  
**Medium Severity Issues:** 1

---

## 1. CRITICAL: Incorrect Balance Checked for Card Issuance Fee Deduction

### Issue: Wrong Context Balance Used for Verification

**File:** `payit-particle/src/mobile-api.js` (lines 2050-2073)  
**Endpoint:** `POST /api/mobile/cards/issue`

### Vulnerable Code:
```javascript
if (requestUrl.pathname === '/api/mobile/cards/issue') {
  const context = payload.context || user.active_context || 'personal';
  // ... fee calculation ...
  
  // Step 3: Get user's current USDT balance
  let currentBalanceUsdt = 0;
  try {
    const stmt = db.db.prepare(
      'SELECT SUM(expected_amount) as total FROM hd_deposits 
       WHERE user_id = ? OR user_id = ? OR virtual_account_no = ?'
    );
    const row = stmt.get(telegramId, user?.personal_smart_account || '', 
                         user?.nuvion_account_no || '');
    currentBalanceUsdt = Number(row?.total || 0);
  } catch (balErr) {
    console.warn('[Card Fee] Balance fetch warning:', balErr.message);
  }
  
  // Step 4: Check if user has sufficient balance
  if (currentBalanceUsdt < totalFee) {
    return sendJson(res, 400, { error: '...' });
  }
  
  // Step 5: Deduct fee from BOTH contexts combined
  const feeDeductId = `card_fee_deduct_${cardInfo.cardId}_${Date.now()}`;
  db.createHdDeposit(
    feeDeductId, 
    telegramId, 
    -totalFee, 
    'USDT', 
    `card_issuance_fee_${cardType}`, 
    context === 'business' ? user?.business_smart_account : user?.personal_smart_account
  );
}
```

### Root Cause Analysis:

1. **Balance Query is Non-Context-Specific:**
   - The query sums ALL deposits for a user across BOTH contexts:
     ```sql
     SELECT SUM(expected_amount) as total FROM hd_deposits 
     WHERE user_id = ? OR virtual_account_no = ?
     ```
   - This query doesn't filter by `context` or `deposit_address` (which is specific to personal vs. business smart account)
   - A user with $100 personal balance + $0 business balance could issue a business card using personal funds

2. **Fee Deduction is Context-Isolated (Correct):**
   - The deduction uses the correct smart account:
     ```javascript
     context === 'business' 
       ? user?.business_smart_account 
       : user?.personal_smart_account
     ```
   - But if the balance check passed on combined balance, the deduction will be incorrectly deducted from the wrong context

### Attack Scenario:

```
User "Alice" has:
- Personal balance: $150 USDT
- Business balance: $0 USDT
- Virtual Card Fee: $2.50

Attack:
1. Alice calls POST /api/mobile/cards/issue with context="business"
2. Balance check: $150 + $0 = $150 > $2.50 ✓ PASS (WRONG - should only check $0)
3. Fee deduction: -$2.50 from business_smart_account (creates negative balance or fails)
4. Result: Business account now has -$2.50 balance or card issuance fails due to ledger inconsistency
```

### Impact: 🔴 CRITICAL

- **Balance Cross-Contamination:** Personal balance can be used for business card issuance
- **Ledger Inconsistency:** Deductions may occur against one context while check passed on another
- **Audit Trail Issues:** Fee records show deduction from one context, but balance came from another
- **Financial Mismatch:** Could result in business balance going negative

### Recommended Fix:

```javascript
// CORRECT: Context-scoped balance check
let contextBalanceUsdt = 0;
try {
  const targetSmartAccount = context === 'business' 
    ? (user.business_smart_account || user.owner_address)
    : (user.personal_smart_account || user.owner_address);
  
  // Only sum deposits to THIS context's smart account
  const stmt = db.db.prepare(
    'SELECT SUM(expected_amount) as total FROM hd_deposits WHERE deposit_address = ?'
  );
  const row = stmt.get(targetSmartAccount);
  contextBalanceUsdt = Number(row?.total || 0);
} catch (balErr) {
  console.warn('[Card Fee] Balance fetch warning:', balErr.message);
}

if (contextBalanceUsdt < totalFee) {
  return sendJson(res, 400, {
    error: `Insufficient ${context} balance. Required: $${totalFee.toFixed(2)}, Available: $${contextBalanceUsdt.toFixed(2)}`
  });
}
```

---

## 2. CRITICAL: Race Condition in Fee Deduction Without Atomic Transaction

### Issue: Non-Atomic Balance Check → Deduction

**File:** `payit-particle/src/mobile-api.js` (lines 2050-2090)  
**Endpoint:** `POST /api/mobile/cards/issue`

### Vulnerable Code:
```javascript
// Check 1: Balance verification (NOT atomic)
if (currentBalanceUsdt < totalFee) {
  return sendJson(res, 400, { ... });
}

// Time gap for race condition HERE

// Step 5: Deduction (separate operation)
db.createHdDeposit(feeDeductId, telegramId, -totalFee, 'USDT', ...);
```

### Root Cause Analysis:

Between the balance check and the fee deduction, another concurrent request could:
1. Deduct from the same balance
2. Issue another card using the same funds
3. Cause the account balance to go negative or exceed double-spending

### Attack Scenario:

```
Parallel Requests:
Request 1: POST /api/mobile/cards/issue with $2.50 fee
Request 2: POST /api/mobile/cards/issue with $2.50 fee

Timing:
T1: Request 1 - Check balance: $3 > $2.50 ✓
T2: Request 2 - Check balance: $3 > $2.50 ✓
T3: Request 1 - Deduct: $3 - $2.50 = $0.50
T4: Request 2 - Deduct: $0.50 - $2.50 = -$2.00 ❌ BALANCE GOES NEGATIVE
```

### Impact: 🔴 CRITICAL

- **Double-Spending:** User can issue multiple cards beyond available balance
- **Negative Balance:** Ledger balance becomes negative (accounting inconsistency)
- **Fee Loss:** Both cards issued but fees not properly accounted
- **Settlement Issues:** Negative balance may affect payout calculations

### Recommended Fix:

```javascript
// Use atomic transaction:
const txn = db.db.transaction(() => {
  // Check balance within transaction
  const stmt = db.db.prepare(
    'SELECT SUM(expected_amount) as total FROM hd_deposits WHERE deposit_address = ? AND user_id = ?'
  );
  const row = stmt.get(targetSmartAccount, telegramId);
  const contextBalanceUsdt = Number(row?.total || 0);
  
  if (contextBalanceUsdt < totalFee) {
    throw new Error(`Insufficient balance: ${contextBalanceUsdt} < ${totalFee}`);
  }
  
  // Deduct within same transaction
  db.createHdDeposit(feeDeductId, telegramId, -totalFee, 'USDT', ...);
  
  return { success: true, newBalance: contextBalanceUsdt - totalFee };
});

try {
  const result = txn();
  // ... proceed with card issuance
} catch (err) {
  return sendJson(res, 400, { error: err.message });
}
```

---

## 3. HIGH: Fallback Balance Query is Non-Context-Specific

### Issue: Fallback hd_deposits Query Missing Context Filter

**File:** `payit-particle/src/mobile-api.js` (lines 719-726)

### Vulnerable Code:
```javascript
// Fallback: check hd_deposits table if Nuvion call fails
if (currentBalanceUsdt === 0) {
  try {
    const stmt = db.db.prepare(
      'SELECT SUM(expected_amount) as total FROM hd_deposits 
       WHERE user_id = ? OR user_id = ? OR virtual_account_no = ?'
    );
    const row = stmt.get(userId, user?.owner_address || '', user?.nuvion_account_no || '');
    currentBalanceUsdt = Number(row?.total || 0);
  } catch (_) {}
}
```

### Issues:

1. **`OR virtual_account_no = ?` Clause:** This could match NGN account numbers from personal context when checking business balance
2. **Multiple User ID Formats:** Query checks `user_id`, `owner_address`, and `nuvion_account_no` without distinguishing context
3. **No Smart Account Filter:** Should filter by `deposit_address` (context-specific smart account)

### Impact: 🟠 HIGH

- Personal account number could match and include deposits meant for business
- Multiple user ID formats could cause cross-context leakage

### Recommended Fix:
```javascript
const targetSmartAccount = context === 'business' 
  ? (user.business_smart_account || user.owner_address)
  : (user.personal_smart_account || user.owner_address);

const stmt = db.db.prepare(
  'SELECT SUM(expected_amount) as total FROM hd_deposits 
   WHERE (user_id = ? AND deposit_address = ?)'
);
const row = stmt.get(userId, targetSmartAccount);
```

---

## 4. HIGH: nuvion-service.js syncNuvionLiveAccountBalance Missing Profile Context Filter

### Issue: Balance Sync Queries Entire User Account List Without Context Isolation

**File:** `payit-particle/src/nuvion-service.js` (lines 582-612)  
**Function:** `syncNuvionLiveAccountBalance(userId, context = 'personal')`

### Vulnerable Code:
```javascript
// ── Step 1: Resolve THIS user's specific Nuvion account from DB ──
let userNuvionAccountId = specificAccountId;
let userNuvionAccountNo = null;
try {
  const userRow = db.db.prepare(
    'SELECT a.nuvion_account_id, a.nuvion_account_no 
     FROM accounts a 
     JOIN profiles p ON a.profile_id = p.profile_id 
     WHERE (p.user_id = ? OR p.universal_account_address = ?) 
     AND p.type = ?'
  ).get(effectiveUserId, effectiveUserId, context);
  
  if (userRow?.nuvion_account_id) {
    userNuvionAccountId = userRow.nuvion_account_id;
    userNuvionAccountNo = userRow.nuvion_account_no;
  }
} catch (_) {}

// ── Step 2: Query Nuvion accounts and isolate this user's account ──
const resAccList = await requestNuvionWithFallback('/accounts', 'GET');
const accList = resAccList?.data?.data || resAccList?.data || [];

let totalNgn = 0;
let targetAccId = userNuvionAccountId;
let targetAccNum = userNuvionAccountNo || null;

for (const acc of accList) {
  if (acc.currency === 'NGN' && acc.status === 'active') {
    const koboBalance = Number(acc.balance?.current || acc.balance?.available || 0);
    const ngnBal = koboBalance / 100;
    const isThisUsersAccount =
      // Match strictly by stored account ID for this profile context
      (userNuvionAccountId && acc.id === userNuvionAccountId) ||
      // Match by stored account number for this profile context
      (userNuvionAccountNo && acc.nuvion_ban === userNuvionAccountNo) ||
      // Match by platform user ID AND context tag
      (acc.meta?.platform_user_id === effectiveUserId && acc.meta?.context === context);

    if (isThisUsersAccount) {
      totalNgn += ngnBal;  // <-- ACCUMULATES BALANCE
      targetAccId = acc.id;
      targetAccNum = acc.nuvion_ban || targetAccNum;
    }
  }
}
```

### Root Cause Analysis:

While the code includes context-aware matching (`acc.meta?.context === context`), it has several weaknesses:

1. **Fallback Matching Without Context:** If the DB lookup fails, it falls back to matching by `platform_user_id` alone
2. **Loop Accumulates Balance:** The `totalNgn += ngnBal` could add multiple accounts if matching is loose
3. **No Explicit Context Assertion:** If the first condition matches (stored account ID), it doesn't verify context

### Impact: 🟠 HIGH

- If DB queries fail, sync could include accounts from wrong context
- Balance sync could include business account balance when syncing personal context

### Recommended Fix:
```javascript
const isThisUsersAccount =
  // Strictly require context + ID match
  (userNuvionAccountId && acc.id === userNuvionAccountId && acc.meta?.context === context) ||
  // Strictly require context + account number match
  (userNuvionAccountNo && acc.nuvion_ban === userNuvionAccountNo && acc.meta?.context === context) ||
  // Final fallback with explicit context requirement
  (acc.meta?.platform_user_id === effectiveUserId && acc.meta?.context === context);
```

---

## 5. MEDIUM: Nuvion Account Creation Doesn't Validate Context Consistency

### Issue: Account Creation Meta Tags May Not Be Enforced on Retrieval

**File:** `payit-particle/src/nuvion-service.js` (lines 380-430)  
**Function:** `getOrCreateDepositAccount()`

### Vulnerable Code:
```javascript
// Step 2: Create a Nuvion account for this currency and transaction
const account = await requestNuvionWithFallback('/accounts', 'POST', {
  entity_id: entityId,
  type: 'checking',
  currency: nuvionCurrency,
  display_name: accDisplayName,
  meta: { platform_user_id: userId, context: context }  // <-- Context tag set
});
```

### Issue:

While context is stored in Nuvion's `meta` field, there's no validation that:
1. Nuvion actually persists the meta tag
2. On retrieval, the context tag is correctly returned
3. The endpoint doesn't create duplicate accounts with wrong context

### Impact: 🟡 MEDIUM

- If Nuvion doesn't persist meta tags, context isolation is lost
- No way to verify that Nuvion side reflects the context separation

### Recommended Fix:
```javascript
// After account creation, verify meta tag was persisted
const verifyRes = await requestNuvionWithFallback(`/accounts/${accountId}`, 'GET');
const verifiedAccount = verifyRes?.data?.data || verifyRes?.data || {};

if (verifiedAccount.meta?.context !== context) {
  console.warn(
    `[Nuvion] Account ${accountId} context mismatch: ` +
    `expected "${context}" but got "${verifiedAccount.meta?.context}"`
  );
  // Patch the account to correct context
  await requestNuvionWithFallback(`/accounts/${accountId}`, 'PATCH', {
    meta: { ...verifiedAccount.meta, context: context }
  });
}
```

---

## 6. Positive Finding: ✅ Context Correctly Passed to CardIssuanceModal

**Files:**
- `Dashboard.tsx` (line 435): `context="personal"`
- `Business.tsx` (line 427): `context="business"`

**Assessment:** ✅ PASS - Context is correctly hardcoded when instantiating the modal for each screen. No vulnerability here.

---

## 7. Positive Finding: ✅ CardIssuanceModal Sends Context to Backend

**File:** `CardIssuanceModal.tsx` (lines 105-110)

**Assessment:** ✅ PASS - Modal correctly includes context in POST payload:
```javascript
const payload: any = {
  card_type: selectedCardType,
  currency: selectedCurrency,
  context: context,  // <-- Correctly passed
  nuvion_fee: nuvionFee
};
```

---

## Summary Table

| # | Severity | Issue | Location | Fix Priority |
|---|----------|-------|----------|----------------|
| 1 | 🔴 CRITICAL | Wrong context balance checked for card fee | `mobile-api.js:722` | P0 - Immediate |
| 2 | 🔴 CRITICAL | Race condition in balance check → deduction | `mobile-api.js:2050-2090` | P0 - Immediate |
| 3 | 🟠 HIGH | Fallback query missing context filter | `mobile-api.js:722` | P1 - Next release |
| 4 | 🟠 HIGH | Sync balance query missing context assertion | `nuvion-service.js:611` | P1 - Next release |
| 5 | 🟡 MEDIUM | No verification of Nuvion meta tag persistence | `nuvion-service.js:430` | P2 - Future |
| 6 | ✅ | Context correctly passed in UI | `Dashboard/Business.tsx` | N/A - No issue |
| 7 | ✅ | Modal sends context to backend | `CardIssuanceModal.tsx` | N/A - No issue |

---

## Remediation Actions Required

### Immediate (P0):

1. **Fix balance check query to be context-specific:**
   - Use `deposit_address` (smart account) as primary filter
   - Remove aggregation across contexts

2. **Implement atomic transaction for balance check + deduction:**
   - Use SQLite transaction to prevent race conditions
   - Lock the user's balance row during operation

### Next Release (P1):

3. **Add explicit context assertions to all balance queries**
4. **Add verification of Nuvion meta tag persistence**
5. **Add audit logs for context switches with fee deductions**

### Testing Recommendations:

```javascript
// Test 1: Cross-context balance isolation
test('Personal card fee should not use business balance', async () => {
  const user = createTestUser({ personal: $100, business: $0 });
  const result = await issueCard(user.id, 'personal', $2.50);
  assert(result.success === true);
  assert(user.personal === $97.50);
  assert(user.business === $0);
});

// Test 2: Reverse isolation
test('Business card fee should not use personal balance', async () => {
  const user = createTestUser({ personal: $0, business: $100 });
  const result = await issueCard(user.id, 'business', $2.50);
  assert(result.success === true);
  assert(user.personal === $0);
  assert(user.business === $97.50);
});

// Test 3: Race condition prevention
test('Concurrent card issuance should not double-spend', async () => {
  const user = createTestUser({ balance: $2.50 });
  const [r1, r2] = await Promise.all([
    issueCard(user.id, 'personal', $2.50),
    issueCard(user.id, 'personal', $2.50)
  ]);
  assert(r1.success === true);
  assert(r2.success === false, 'Second request should fail due to insufficient balance');
});
```

---

## Conclusion

The card issuance system has **critical context isolation vulnerabilities** that could allow personal and business balances to be cross-contaminated, especially during card fee deductions. These issues require immediate remediation before the feature is released to production.

**Risk Level:** 🔴 **CRITICAL**

**Recommended Action:** Freeze card issuance feature pending security fixes to balance checking and fee deduction logic.
