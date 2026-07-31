# Bugfix Requirements Document: Netlify Production Critical Bugs

## Introduction

Two critical bugs prevent the PayIT mobile app from functioning properly in production on Netlify. The first bug causes authentication to fail by returning mock tokens instead of real Magic.link DID tokens. The second bug prevents users who existed before a database migration from accessing their historical deposits and transaction data. These bugs must be fixed to restore full production functionality.

---

## Bug Analysis

### Bug 1: Magic Link Authentication Returns Mock Tokens

#### Current Behavior (Defect)

1.1 WHEN the `/api/mobile/send-magic-link` endpoint is called with an email address THEN the system returns a mock token with format `payit_email_${email}` instead of triggering real Magic.link authentication

1.2 WHEN the frontend `MagicVerifyScreen` component attempts to verify authentication THEN the system creates a development token `dev_magic_token_${timestamp}` instead of using Magic SDK's `loginWithMagicLink()` method

1.3 WHEN a user attempts to authenticate in production THEN the system bypasses Magic.link's DID token generation entirely and creates fake tokens that cannot validate user identity

#### Expected Behavior (Correct)

2.1 WHEN the `/api/mobile/send-magic-link` endpoint is called with an email address THEN the system SHALL invoke Magic.link SDK to send a real magic link email and return a pending authentication status

2.2 WHEN the frontend `MagicVerifyScreen` component attempts to verify authentication THEN the system SHALL call `magic.auth.loginWithMagicLink()` to retrieve a valid DID token from Magic.link

2.3 WHEN a user completes Magic.link authentication THEN the system SHALL receive and validate a real DID token that can be verified using `magic.token.validate()` or equivalent Magic SDK method

#### Unchanged Behavior (Regression Prevention)

3.1 WHEN Magic.link authentication fails or times out THEN the system SHALL CONTINUE TO return appropriate error messages to the user

3.2 WHEN a user's email is not registered THEN the system SHALL CONTINUE TO provision new accounts with proper smart account addresses

3.3 WHEN the Magic.link DID token is verified successfully THEN the system SHALL CONTINUE TO look up the user by issuer, email, or owner_address as before

---

### Bug 2: Historical User Data Not Accessible

#### Current Behavior (Defect)

1.4 WHEN querying user balance at line ~522 of `mobile-api.js` THEN the system uses restrictive AND condition `WHERE (deposit_address = ? AND user_id = ?)` which filters out pre-migration deposits

1.5 WHEN querying transaction history at line ~593 of `mobile-api.js` THEN the system uses similar restrictive AND condition that excludes historical records where user identifiers have changed

1.6 WHEN looking up users by identifier at line ~235 of `mobile-api.js` THEN the system only searches `telegram_id`, `owner_address`, and `email` fields, missing users who have `mobile_auth_id` or different smart account identifiers

1.7 WHEN pre-migration users have deposits with different `user_id` or `deposit_address` values THEN the system fails to retrieve their historical balance and transaction data

#### Expected Behavior (Correct)

2.4 WHEN querying user balance THEN the system SHALL use OR conditions to include all deposits matching any of: `deposit_address`, `user_id`, or `virtual_account_no` associated with the user's profiles

2.5 WHEN querying transaction history THEN the system SHALL retrieve all transactions where the user's personal_smart_account, business_smart_account, owner_address, OR any legacy identifiers match

2.6 WHEN looking up users by identifier THEN the system SHALL search ALL possible identifier fields including `user_id`, `telegram_id`, `mobile_auth_id`, `owner_address`, `personal_smart_account`, `business_smart_account`, and `email`

2.7 WHEN a user has multiple historical identifiers from migrations THEN the system SHALL aggregate all deposits and transactions across all their identifier values

#### Unchanged Behavior (Regression Prevention)

3.4 WHEN querying deposits for new users who have consistent identifiers THEN the system SHALL CONTINUE TO retrieve their data correctly without performance degradation

3.5 WHEN virtual account numbers are used to track deposits THEN the system SHALL CONTINUE TO properly associate them with user profiles through the `accounts` table

3.6 WHEN calculating balance totals THEN the system SHALL CONTINUE TO sum amounts correctly and convert currencies using the FX service

3.7 WHEN retrieving transactions for display THEN the system SHALL CONTINUE TO format them with proper timestamps, amounts, and status information

---

### Supporting Infrastructure Gaps

#### Current Behavior (Defect)

1.8 WHEN the code attempts to call `parseJsonBody()` at line ~169 of `mobile-api.js` THEN the system crashes because this function is not defined

1.9 WHEN the code needs to find all addresses associated with a user THEN the system lacks a helper function to retrieve `personal_smart_account`, `business_smart_account`, and `owner_address` together

1.10 WHEN the code needs to find a user by any identifier type THEN the system lacks a comprehensive lookup function that checks all possible fields

#### Expected Behavior (Correct)

2.8 WHEN the code calls `parseJsonBody()` THEN the system SHALL have a defined function that safely parses request bodies and handles JSON parsing errors

2.9 WHEN the code needs all user addresses THEN the system SHALL have a `getAllUserAddresses(user)` helper function that returns an array of all associated addresses including smart accounts and owner address

2.10 WHEN the code needs to find a user by any identifier THEN the system SHALL have a `findUserByAllIdentifiers(identifier)` helper function that checks user_id, telegram_id, mobile_auth_id, owner_address, personal_smart_account, business_smart_account, and email fields

#### Unchanged Behavior (Regression Prevention)

3.8 WHEN existing helper functions like `getUser()`, `getProfile()`, and `getProfileByType()` are called THEN the system SHALL CONTINUE TO work as before without breaking changes

3.9 WHEN database queries use prepared statements THEN the system SHALL CONTINUE TO properly escape parameters and prevent SQL injection

3.10 WHEN error handling wraps database operations THEN the system SHALL CONTINUE TO catch exceptions and return appropriate error responses

---

## Bug Condition Definitions

### Bug Condition 1: Mock Token Generation

```pascal
FUNCTION isMockTokenBug(authRequest)
  INPUT: authRequest of type AuthenticationRequest
  OUTPUT: boolean
  
  // Returns true when mock tokens are generated instead of real Magic.link tokens
  RETURN (authRequest.environment = 'production' OR authRequest.environment = 'staging')
         AND (authRequest.token_format MATCHES 'payit_email_*' 
              OR authRequest.token_format MATCHES 'dev_magic_token_*')
END FUNCTION
```

**Property: Fix Checking - Real Magic.link Integration**
```pascal
FOR ALL authRequest WHERE isMockTokenBug(authRequest) DO
  result ← authenticateWithMagicLink'(authRequest.email)
  ASSERT result.token_type = 'DID_TOKEN' 
         AND result.can_be_verified_by_magic_sdk = true
         AND result.issuer_format MATCHES 'did:ethr:0x*'
END FOR
```

---

### Bug Condition 2: Historical Data Exclusion

```pascal
FUNCTION isHistoricalDataBug(userQuery)
  INPUT: userQuery of type UserDataQuery
  OUTPUT: boolean
  
  // Returns true when queries use restrictive AND conditions
  // that exclude pre-migration records
  RETURN userQuery.has_pre_migration_records = true
         AND (userQuery.uses_AND_on_identifiers = true
              OR userQuery.checks_only_subset_of_identifiers = true)
END FUNCTION
```

**Property: Fix Checking - Inclusive Data Retrieval**
```pascal
FOR ALL userQuery WHERE isHistoricalDataBug(userQuery) DO
  result ← retrieveUserData'(userQuery.user)
  historicalRecords ← getAllLegacyRecords(userQuery.user)
  
  ASSERT result.deposits CONTAINS_ALL historicalRecords.deposits
         AND result.transactions CONTAINS_ALL historicalRecords.transactions
         AND COUNT(result.deposits) >= COUNT(historicalRecords.deposits)
END FOR
```

---

### Bug Condition 3: Missing Helper Functions

```pascal
FUNCTION isMissingHelperBug(codeExecution)
  INPUT: codeExecution of type CodeExecutionContext
  OUTPUT: boolean
  
  // Returns true when undefined helper functions are called
  RETURN codeExecution.function_name IN ['parseJsonBody', 
                                           'getAllUserAddresses',
                                           'findUserByAllIdentifiers']
         AND codeExecution.function_defined = false
END FUNCTION
```

**Property: Fix Checking - Helper Function Availability**
```pascal
FOR ALL codeExecution WHERE isMissingHelperBug(codeExecution) DO
  result ← callHelperFunction'(codeExecution.function_name, codeExecution.args)
  
  ASSERT result.error = null 
         AND result.returns_valid_output = true
         AND no_crash(result)
END FOR
```

---

### Preservation Property - Non-Buggy Inputs

```pascal
// Property: Preservation Checking
FOR ALL request WHERE NOT (isMockTokenBug(request) 
                          OR isHistoricalDataBug(request) 
                          OR isMissingHelperBug(request)) DO
  ASSERT F(request) = F'(request)
END FOR
```

Where:
- **F**: Original (unfixed) mobile-api.js implementation
- **F'**: Fixed mobile-api.js implementation

This ensures that for all valid requests that don't trigger the bugs (new users with consistent identifiers, proper development mode testing, valid API calls), the fixed code behaves identically to the original.

---

## Impact Summary

**Critical User Impact:**
- Production users cannot authenticate (Bug 1)
- Pre-migration users cannot access their funds or transaction history (Bug 2)
- System crashes when certain endpoints are called (Bug 3)

**Files Requiring Changes:**
1. `src/mobile-api.js` - Lines ~169, ~201, ~235, ~522, ~593
2. `payit-mobile/src/App.tsx` - Lines ~581-654 (MagicVerifyScreen component)

**Environment Variables Required:**
- `MAGIC_SECRET_KEY` must be properly configured in Netlify environment for Magic.link SDK integration
