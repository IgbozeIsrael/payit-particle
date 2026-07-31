# Implementation Plan: Netlify Production Critical Bugs

## Overview

This implementation plan fixes three critical bugs blocking production:
1. **Magic Link Authentication** - Mock tokens instead of real Magic.link DID tokens
2. **Historical Data Exclusion** - Pre-migration users can't access their deposits/transactions
3. **Missing Helper Functions** - Undefined functions causing endpoint crashes

---

## Phase 1: Bug Condition Exploration (BEFORE Fix)

### Task 1: Write Bug Condition Exploration Tests

- [ ] 1. Write bug condition exploration tests for all three bugs
  - **Property 1: Bug Condition** - Mock Token Generation, Historical Data Exclusion, and Missing Helper Functions
  - **CRITICAL**: These tests MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior - they will validate the fixes when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bugs exist
  
  **Test 1.1: Magic Link Mock Token Bug**
  - **Scoped PBT Approach**: Test production authentication endpoint with concrete email addresses
  - Set `NODE_ENV=production` environment
  - POST to `/api/mobile/send-magic-link` with `{ email: "test@example.com" }`
  - Test that response returns mock token format `payit_email_test@example.com` (current buggy behavior)
  - Test that Magic SDK was NOT invoked (check for `magicService.sendMagicLink` call)
  - Verify no email was sent by Magic.link (check Magic.link dashboard for zero events)
  - **Expected Behavior (from design)**: Should call Magic SDK and return `{ status: 'pending_verification' }` instead
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves Bug 1 exists)
  - Document counterexample: "Magic Link endpoint returns mock token 'payit_email_X' instead of calling Magic SDK"
  
  **Test 1.2: Historical Data Exclusion Bug - Balance Query**
  - **Scoped PBT Approach**: Test balance query with pre-migration user having historical deposits
  - Setup: Create test user in database:
    - Initial state: `user_id = "old_telegram_id"`, deposit with `deposit_address = "0xOLD123"`
    - Migrated state: Update user to `mobile_auth_id = "did:ethr:0xNEW456"`, `personal_smart_account = "0xNEW789"`
  - Authenticate as this user and GET `/api/mobile/balance`
  - Test that balance returns 0 despite historical deposits existing (current buggy behavior)
  - Query database directly to confirm deposits exist: `SELECT * FROM hd_deposits WHERE deposit_address = '0xOLD123'`
  - **Expected Behavior (from design)**: Should use OR conditions to include all deposits matching old AND new identifiers
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (balance = 0 when should be > 0)
  - Document counterexample: "User with $100 historical deposit shows $0 balance after migration"
  
  **Test 1.3: Historical Data Exclusion Bug - Transaction Query**
  - **Scoped PBT Approach**: Test transaction history with same pre-migration user
  - Setup: Same user from Test 1.2 with historical transactions in database
  - GET `/api/mobile/transactions`
  - Test that transactions array is empty despite historical records existing (current buggy behavior)
  - Query database directly to confirm transactions exist
  - **Expected Behavior (from design)**: Should retrieve ALL transactions across old and new identifiers
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (empty array when should contain historical transactions)
  - Document counterexample: "User with 5 historical transactions sees empty history after migration"
  
  **Test 1.4: Missing Helper Functions Bug**
  - **Scoped PBT Approach**: Test endpoint calls that trigger undefined function errors
  - Test 1: POST to `/api/mobile/send-magic-link` with valid JSON body
    - Expect crash: `ReferenceError: parseJsonBody is not defined` at line 169
  - Test 2: Call user lookup logic that would use `findUserByAllIdentifiers` (line 235 area)
    - Expect function not to exist or incorrect logic that misses identifiers
  - Test 3: Call balance query that would use `getAllUserAddresses` helper
    - Expect function not to exist or incomplete address collection
  - **Expected Behavior (from design)**: All three helper functions should be defined and functional
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL with ReferenceError or incorrect behavior
  - Document counterexample: "parseJsonBody undefined at line 169 causing endpoint crash"
  
  - Mark task complete when all tests are written, run, and failures are documented
  - Save test output showing failures to confirm bugs exist
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

---

## Phase 2: Preservation Tests (BEFORE Fix)

### Task 2: Write Preservation Property Tests

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Buggy Input Behavior
  - **IMPORTANT**: Follow observation-first methodology
  - **GOAL**: Document existing behavior for non-buggy inputs that must be preserved after the fix
  
  **Test 2.1: Development Mode Authentication Preservation**
  - Observe: Set `NODE_ENV=development` and POST to `/api/mobile/send-magic-link`
  - Observe: Record the response format and behavior on UNFIXED code
  - Write property-based test: For development environment, behavior should match observed pattern
  - If dev mode uses fallback tokens, that should continue working after fix
  - Verify test passes on UNFIXED code
  - **Expected Behavior**: Authentication works in development without requiring Magic.link (if that's the design)
  
  **Test 2.2: New User Balance Query Preservation**
  - Observe: Create brand new user with consistent identifiers (no migration)
    - User has `user_id = "new_user_123"`, `personal_smart_account = "0xABC"`
    - User has deposits with matching `deposit_address = "0xABC"` and `user_id = "new_user_123"`
  - Observe: GET `/api/mobile/balance` and record the balance value on UNFIXED code
  - Write property-based test: For all new users with consistent identifiers, balance should match deposit sum
  - Verify test passes on UNFIXED code
  - **Expected Behavior**: New users without migration history should see correct balance (existing logic works)
  
  **Test 2.3: New User Transaction Query Preservation**
  - Observe: Same new user from Test 2.2 with recent transactions
  - Observe: GET `/api/mobile/transactions` and record transaction list on UNFIXED code
  - Write property-based test: For all new users, transactions list includes all their records
  - Verify test passes on UNFIXED code
  - **Expected Behavior**: New users see correct transaction history (existing logic works)
  
  **Test 2.4: Other Endpoints Preservation**
  - Observe: Test other endpoints that should be unaffected by the fix:
    - GET `/api/mobile/me` - user profile retrieval
    - GET `/api/mobile/savings` - savings account data
    - GET `/api/mobile/cards` - virtual card management
  - Observe: Record responses on UNFIXED code for valid requests
  - Write property-based tests: For all non-auth, non-balance, non-transaction endpoints, behavior unchanged
  - Verify tests pass on UNFIXED code
  - **Expected Behavior**: All other endpoints work identically before and after fix
  
  **Test 2.5: Error Handling Preservation**
  - Observe: Test invalid requests on UNFIXED code:
    - POST to `/api/mobile/send-magic-link` with missing email
    - GET `/api/mobile/balance` with invalid authentication
    - Malformed JSON requests
  - Observe: Record error responses on UNFIXED code
  - Write property-based test: For all error cases, error messages should match observed format
  - Verify tests pass on UNFIXED code
  - **Expected Behavior**: Error handling remains consistent after fix
  
  **Test 2.6: Database Query Performance Preservation**
  - Observe: Measure query execution time for balance and transaction endpoints on UNFIXED code
  - Write property-based test: Query execution time should not significantly increase after fix
  - Target: OR queries should complete within 2x of original AND query time
  - Verify baseline performance on UNFIXED code
  - **Expected Behavior**: Fix doesn't introduce performance regressions
  
  - Mark task complete when all tests are written, run, and passing on UNFIXED code
  - Document observed behaviors that must be preserved
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

---

## Phase 3: Implementation

### Task 3: Implement the Fixes

- [ ] 3. Fix all three critical bugs

  - [ ] 3.1 Add missing helper functions to mobile-api.js
    - Open file: `src/mobile-api.js`
    - Locate the helper function section (after existing helpers like `getOrProvisionReceiveMethods`)
    - Add `parseJsonBody(req)` function:
      ```javascript
      // Helper: Safely parse JSON request body
      async function parseJsonBody(req) {
        return new Promise((resolve, reject) => {
          let body = '';
          req.on('data', chunk => body += chunk.toString());
          req.on('end', () => {
            try {
              resolve(body ? JSON.parse(body) : {});
            } catch (e) {
              resolve({});
            }
          });
          req.on('error', () => resolve({}));
        });
      }
      ```
    - Add `getAllUserAddresses(user)` function:
      ```javascript
      // Helper: Get all addresses associated with a user
      function getAllUserAddresses(user) {
        const addresses = new Set();
        if (user.personal_smart_account) addresses.add(user.personal_smart_account);
        if (user.business_smart_account) addresses.add(user.business_smart_account);
        if (user.owner_address) addresses.add(user.owner_address);
        return Array.from(addresses).filter(Boolean);
      }
      ```
    - Add `findUserByAllIdentifiers(identifier, db)` function:
      ```javascript
      // Helper: Find user by checking all possible identifier fields
      function findUserByAllIdentifiers(identifier, db) {
        const cleanId = (identifier || '').trim().toLowerCase();
        if (!cleanId) return null;
        
        const stmt = db.prepare(`
          SELECT * FROM users 
          WHERE LOWER(COALESCE(user_id, '')) = ?
             OR LOWER(COALESCE(telegram_id, '')) = ?
             OR LOWER(COALESCE(mobile_auth_id, '')) = ?
             OR LOWER(COALESCE(owner_address, '')) = ?
             OR LOWER(COALESCE(personal_smart_account, '')) = ?
             OR LOWER(COALESCE(business_smart_account, '')) = ?
             OR LOWER(COALESCE(email, '')) = ?
             OR LOWER(COALESCE(business_email, '')) = ?
          LIMIT 1
        `);
        return stmt.get(cleanId, cleanId, cleanId, cleanId, cleanId, cleanId, cleanId, cleanId);
      }
      ```
    - _Bug_Condition: isMissingHelperBug(codeExecution) where function_name IN ['parseJsonBody', 'getAllUserAddresses', 'findUserByAllIdentifiers'] AND function_defined = false_
    - _Expected_Behavior: For all calls to these helpers, no ReferenceError and valid output returned (from design Property 3)_
    - _Preservation: Existing helpers (getUser, getProfile, getProfileByType) unchanged (from design)_
    - _Requirements: 2.8, 2.9, 2.10_

  - [ ] 3.2 Fix Magic Link endpoint to use real Magic SDK
    - Open file: `src/mobile-api.js`
    - Locate the `/api/mobile/auth/send-magic-link` endpoint handler (around line 166-221)
    - Replace mock token generation with Magic SDK call:
      ```javascript
      // ✅ FIX: INVOKE REAL MAGIC.LINK SDK
      try {
        // Call Magic SDK to send authentication email
        await magicService.sendMagicLink(email);
        
        return sendJson(res, 200, {
          success: true,
          email,
          status: 'pending_verification',
          message: 'Magic link sent to your email. Please check your inbox.',
          is_existing_user: Boolean(existingUser && (existingUser.is_verified || existingUser.first_name))
        });
      } catch (magicError) {
        console.error('[Magic Link] Send failed:', magicError.message);
        return sendJson(res, 500, {
          success: false,
          error: 'Failed to send magic link. Please try again.',
          details: magicError.message
        });
      }
      ```
    - Remove the mock token return line: `token: 'payit_email_${email}'`
    - _Bug_Condition: isMockTokenBug(authRequest) where environment = 'production' AND token_generated MATCHES 'payit_email_*' AND NOT magic_sdk_invoked_
    - _Expected_Behavior: For production auth, invoke Magic SDK and return { status: 'pending_verification' } (from design Property 1)_
    - _Preservation: Development mode authentication continues to work (from design)_
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 3.3 Add sendMagicLink method to magic-service.js
    - Open file: `src/magic-service.js`
    - Add new export method:
      ```javascript
      async function sendMagicLink(email) {
        if (!magic || !process.env.MAGIC_SECRET_KEY) {
          throw new Error('Magic SDK not initialized. Please set MAGIC_SECRET_KEY environment variable.');
        }
        
        try {
          // Use Magic Admin SDK to trigger email OTP
          const result = await magic.users.loginWithEmailOTP({ email });
          return {
            success: true,
            status: 'pending',
            message: 'Magic link sent successfully'
          };
        } catch (error) {
          throw new Error(`Failed to send magic link: ${error.message}`);
        }
      }
      ```
    - Update module.exports to include `sendMagicLink`
    - _Bug_Condition: Magic SDK method missing causes endpoint to use fallback mock tokens_
    - _Expected_Behavior: Magic SDK sends real authentication email and returns DID token_
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 3.4 Fix user lookup logic to use comprehensive identifier search
    - Open file: `src/mobile-api.js`
    - Locate user lookup logic in the authentication middleware (around line 235-289)
    - Replace manual SQL query with helper function call:
      ```javascript
      // ✅ FIX: USE COMPREHENSIVE HELPER FUNCTION
      user = findUserByAllIdentifiers(identifier, db.db);
      ```
    - Remove the old restrictive query that only checked telegram_id, owner_address, and email
    - _Bug_Condition: isHistoricalDataBug where query_checks_only_subset_of_identifiers = true_
    - _Expected_Behavior: Search ALL identifier fields including mobile_auth_id (from design Property 2)_
    - _Preservation: New users with consistent identifiers still found correctly_
    - _Requirements: 2.6_

  - [ ] 3.5 Fix balance query to use inclusive OR conditions
    - Open file: `src/mobile-api.js`
    - Locate balance query endpoint `/api/mobile/balance` (around line 522-570)
    - Replace restrictive AND query with inclusive OR query:
      ```javascript
      // Build comprehensive identifier list
      const userIds = Array.from(new Set([
        telegramId,
        user?.user_id,
        user?.telegram_id,
        user?.mobile_auth_id
      ])).filter(Boolean);
      
      // Build comprehensive address list using helper
      const allAddresses = getAllUserAddresses(user);
      
      // Get profile for virtual account lookup
      const profile = db.getProfileByType(telegramId, activeContext);
      const profId = profile?.profile_id || `prof_${activeContext === 'business' ? 'b' : 'p'}_${telegramId}`;
      
      const userPH = userIds.map(() => '?').join(',');
      const addrPH = allAddresses.map(() => '?').join(',');
      
      // ✅ INCLUSIVE OR QUERY: MATCHES ANY IDENTIFIER OR ADDRESS
      const stmt = db.db.prepare(`
        SELECT SUM(expected_amount) as total 
        FROM hd_deposits 
        WHERE user_id IN (${userPH})
           OR deposit_address IN (${addrPH})
           OR virtual_account_no IN (
               SELECT nuvion_account_no 
               FROM accounts 
               WHERE profile_id = ? OR user_id IN (${userPH})
           )
      `);
      const row = stmt.get(...userIds, ...allAddresses, profId, ...userIds);
      ```
    - _Bug_Condition: isHistoricalDataBug where uses_AND_on_identifiers = true AND has_pre_migration_records = true_
    - _Expected_Behavior: Use OR conditions to include ALL deposits matching ANY user identifier or address (from design Property 2)_
    - _Preservation: New users with single identifier see same balance (from design)_
    - _Requirements: 2.4, 2.7_

  - [ ] 3.6 Fix transaction query to use inclusive OR conditions
    - Open file: `src/mobile-api.js`
    - Locate transaction query endpoint `/api/mobile/transactions` (around line 593-660)
    - Apply same fix pattern as balance query:
      ```javascript
      // Use helper to get all addresses
      const allAddresses = getAllUserAddresses(user);
      
      // Build comprehensive user ID list
      const userIds = Array.from(new Set([
        telegramId,
        user?.user_id,
        user?.telegram_id,
        user?.mobile_auth_id
      ])).filter(Boolean);
      
      const userPH = userIds.map(() => '?').join(',');
      const addrPH = allAddresses.map(() => '?').join(',');
      
      // ✅ INCLUSIVE OR QUERY WITH ALL IDENTIFIERS AND ADDRESSES
      const stmt = db.db.prepare(`
        SELECT * FROM hd_deposits 
        WHERE user_id IN (${userPH})
           OR deposit_address IN (${addrPH})
           OR virtual_account_no IN (
               SELECT nuvion_account_no 
               FROM accounts 
               WHERE profile_id = ? OR user_id IN (${userPH})
           )
        ORDER BY created_at DESC LIMIT 30
      `);
      const deposits = stmt.all(...userIds, ...allAddresses, profId, ...userIds);
      ```
    - _Bug_Condition: isHistoricalDataBug where transaction query excludes pre-migration records_
    - _Expected_Behavior: Retrieve ALL transactions across all user identifiers (from design Property 2)_
    - _Preservation: New users see same transaction list (from design)_
    - _Requirements: 2.5, 2.7_

  - [ ] 3.7 Configure MAGIC_SECRET_KEY in Netlify environment
    - Open Netlify Dashboard → Site Settings → Environment Variables
    - Add new environment variable:
      - Key: `MAGIC_SECRET_KEY`
      - Value: `sk-live-XXXXXXXXXXXXXXXX` (get from Magic.link dashboard)
    - Apply to production and staging environments
    - Trigger new deployment to pick up environment variable
    - _Bug_Condition: Magic SDK fails to initialize without secret key_
    - _Expected_Behavior: Magic SDK properly initialized with valid secret key_
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 3.8 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Real Magic.link Integration, Historical Data Inclusion, Helper Functions Available
    - **IMPORTANT**: Re-run the SAME tests from Task 1 - do NOT write new tests
    - The tests from Task 1 encode the expected behavior
    - When these tests pass, it confirms the bugs are fixed
    
    **Test 3.8.1: Magic Link Real Authentication**
    - Re-run Test 1.1 from Task 1
    - ASSERT: Response is `{ success: true, status: 'pending_verification', message: 'Magic link sent...' }`
    - ASSERT: Magic SDK was invoked (check logs or mock verification)
    - ASSERT: No mock token in response
    - **EXPECTED OUTCOME**: Test PASSES (confirms Bug 1 is fixed)
    
    **Test 3.8.2: Historical Balance Inclusion**
    - Re-run Test 1.2 from Task 1 with same pre-migration user
    - ASSERT: Balance > 0 and includes historical deposits
    - ASSERT: Query returns all deposits across old and new identifiers
    - **EXPECTED OUTCOME**: Test PASSES (confirms Bug 2 balance fix works)
    
    **Test 3.8.3: Historical Transaction Inclusion**
    - Re-run Test 1.3 from Task 1 with same pre-migration user
    - ASSERT: Transactions array includes historical records
    - ASSERT: Query returns all transactions across identifiers
    - **EXPECTED OUTCOME**: Test PASSES (confirms Bug 2 transaction fix works)
    
    **Test 3.8.4: Helper Functions Available**
    - Re-run Test 1.4 from Task 1
    - ASSERT: `parseJsonBody` executes without ReferenceError
    - ASSERT: `getAllUserAddresses` returns correct address array
    - ASSERT: `findUserByAllIdentifiers` finds users by any identifier
    - **EXPECTED OUTCOME**: Test PASSES (confirms Bug 3 is fixed)
    
    - _Requirements: Expected Behavior Properties from design (2.1-2.10)_

  - [ ] 3.9 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Buggy Input Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from Task 2 - do NOT write new tests
    - These tests verify no regressions were introduced
    
    **Test 3.9.1: Development Mode Preservation**
    - Re-run Test 2.1 from Task 2
    - ASSERT: Development authentication still works
    - ASSERT: Response format matches observed baseline from Task 2
    - **EXPECTED OUTCOME**: Test PASSES (no regression)
    
    **Test 3.9.2: New User Balance Preservation**
    - Re-run Test 2.2 from Task 2
    - ASSERT: New users see correct balance (same as before fix)
    - ASSERT: Query performance not degraded
    - **EXPECTED OUTCOME**: Test PASSES (no regression)
    
    **Test 3.9.3: New User Transaction Preservation**
    - Re-run Test 2.3 from Task 2
    - ASSERT: New users see correct transactions (same as before fix)
    - **EXPECTED OUTCOME**: Test PASSES (no regression)
    
    **Test 3.9.4: Other Endpoints Preservation**
    - Re-run Test 2.4 from Task 2
    - ASSERT: All other endpoints work identically to before fix
    - **EXPECTED OUTCOME**: Test PASSES (no regression)
    
    **Test 3.9.5: Error Handling Preservation**
    - Re-run Test 2.5 from Task 2
    - ASSERT: Error responses match observed baseline
    - **EXPECTED OUTCOME**: Test PASSES (no regression)
    
    **Test 3.9.6: Performance Preservation**
    - Re-run Test 2.6 from Task 2
    - ASSERT: Query execution time within acceptable range (< 2x baseline)
    - **EXPECTED OUTCOME**: Test PASSES (no performance regression)
    
    - _Requirements: Preservation Requirements from design (3.1-3.10)_

---

## Phase 4: Deployment and Validation

### Task 4: Deploy to Staging and Production

- [ ] 4. Checkpoint - Ensure all tests pass
  - Run full test suite (exploration + preservation tests)
  - Verify all tests pass locally before deployment
  - Ensure all code changes are committed to git
  - _Requirements: All requirements validated_

- [ ] 5. Deploy to Netlify staging environment
  - Create new git branch: `git checkout -b bugfix/netlify-critical-production-bugs`
  - Commit all changes: `git add src/mobile-api.js src/magic-service.js`
  - Commit message: "Fix critical production bugs: Magic Link auth, historical data queries, missing helpers"
  - Push to remote: `git push -u origin bugfix/netlify-critical-production-bugs`
  - Trigger Netlify staging deployment
  - Wait for deployment to complete
  - Verify staging URL is accessible

- [ ] 6. Manual QA testing on staging
  - **Test 6.1: Production Authentication Flow**
    - Navigate to staging mobile app URL
    - Enter test email address
    - Verify Magic.link email is received (check inbox)
    - Click magic link in email
    - Verify successful authentication and redirect to app
    - Verify DID token is stored (check browser dev tools)
    - Verify protected endpoints are accessible
  
  - **Test 6.2: Pre-Migration User Data Recovery**
    - Authenticate as a pre-migration test user (with historical data)
    - Navigate to balance page
    - Verify historical deposits are visible in balance
    - Navigate to transaction history page
    - Verify historical transactions are displayed
    - Verify amounts and timestamps are correct
  
  - **Test 6.3: New User Onboarding**
    - Authenticate as a brand new email (not in database)
    - Verify account provisioning works
    - Verify smart account addresses are generated
    - Verify user can access all features
  
  - **Test 6.4: Cross-Browser Testing**
    - Repeat Test 6.1 in Chrome, Firefox, Safari, Edge
    - Verify Magic.link works consistently across browsers
  
  - **Test 6.5: Mobile Device Testing**
    - Test authentication flow on iOS Safari
    - Test authentication flow on Android Chrome
    - Verify magic link email opens correctly
    - Verify deep linking back to app works
  
  - Document any issues found and fix before production deployment

- [ ] 7. Deploy to production
  - Verify all staging tests passed
  - Merge branch to main: `git checkout main && git merge bugfix/netlify-critical-production-bugs`
  - Push to production: `git push origin main`
  - Trigger Netlify production deployment
  - Monitor deployment logs for errors
  - Verify production URL is accessible

- [ ] 8. Production smoke tests
  - Test production authentication with real email
  - Verify Magic.link integration works in production
  - Test with known pre-migration user account
  - Verify historical data is accessible
  - Monitor error logs for any new issues
  - Verify no increase in error rates

- [ ] 9. Monitor production for 24 hours
  - Check Netlify analytics for error rates
  - Monitor Magic.link dashboard for authentication events
  - Check database query performance metrics
  - Verify no user-reported issues
  - Document any anomalies and investigate

---

## Success Criteria

**Bug 1 Fixed**: Production users can authenticate via Magic.link and receive real DID tokens  
**Bug 2 Fixed**: Pre-migration users can access their full deposit and transaction history  
**Bug 3 Fixed**: All endpoints execute without ReferenceError crashes  
**No Regressions**: All existing functionality for new users and other endpoints works identically  
**Production Ready**: Application is fully functional on Netlify production environment

---

## Notes

- All tests should be written in a test file (e.g., `tests/bugfix-critical-production.test.js`)
- Use Jest or similar testing framework for running tests
- Property-based tests can use fast-check or similar library for generating test cases
- Keep test database separate from production database
- Use Netlify staging environment for testing before production deployment
- Ensure `MAGIC_SECRET_KEY` is configured in Netlify environment variables
- Monitor Magic.link dashboard for authentication event logs
- Check database indexes if query performance is poor with OR conditions

---

## References

- **Requirements**: `.kiro/specs/netlify-production-critical-bugs/bugfix.md`
- **Design**: `.kiro/specs/netlify-production-critical-bugs/design.md`
- **Magic.link Docs**: https://magic.link/docs
- **Netlify Docs**: https://docs.netlify.com
