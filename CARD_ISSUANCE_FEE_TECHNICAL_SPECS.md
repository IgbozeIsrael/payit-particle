# Card Issuance Fee Integration - Technical Specifications

## 1. Data Models

### CardIssuanceFee (card_issuance_fees table)
```typescript
interface CardIssuanceFee {
  fee_id: string;              // Unique identifier: "card_fee_{timestamp}_{uuid}"
  card_id: string;             // Reference to cards.card_id (UNIQUE constraint)
  user_id: string;             // Reference to users.telegram_id
  profile_id: string;          // Reference to profiles.profile_id
  nuvion_fee: number;          // Base fee from Nuvion (e.g., 2.50)
  platform_fee: number;        // 15% markup (e.g., 0.38)
  total_fee: number;           // Sum of nuvion_fee + platform_fee (e.g., 2.88)
  currency: string;            // ISO 4217 code: 'USD', 'NGN', 'GBP', 'EUR', etc
  status: 'charged' | 'refunded' | 'pending';
  created_at: number;          // Unix timestamp (milliseconds)
  updated_at?: number;         // Unix timestamp (for refunds)
}
```

### Card (cards table - UPDATED)
```typescript
interface Card {
  // Existing fields
  card_id: string;             // Primary key
  profile_id: string;
  nuvion_account_id: string;
  buffer_threshold: number;
  refill_amount: number;
  created_at: number;
  
  // NEW fields for fee integration
  fee_id?: string;             // FK to card_issuance_fees.fee_id
  fee_charged?: number;        // Cache of total_fee (denormalized)
  fee_charged_at?: number;     // Unix timestamp of fee deduction
}
```

### FeeCalculationResult
```typescript
interface FeeCalculationResult {
  platformFee: number;         // 15% of nuvionFee, rounded to 2 decimals
  totalFee: number;            // nuvionFee + platformFee, rounded to 2 decimals
}
```

---

## 2. Function Specifications

### calculateCardFee(nuvionFee: number): FeeCalculationResult

**Purpose**: Calculate platform fee and total fee for card issuance

**Parameters**:
- `nuvionFee` (number, required): Base fee from Nuvion in USD or selected currency

**Returns**: Object with:
- `platformFee` (number): nuvionFee × 0.15, rounded to 2 decimals
- `totalFee` (number): nuvionFee + platformFee, rounded to 2 decimals

**Error Cases**:
- Input < 0: Throw "Fee cannot be negative"
- Input NaN: Throw "Invalid fee amount"
- Input > 1000: Throw "Fee exceeds maximum threshold"

**Implementation**:
```javascript
calculateCardFee(nuvionFee) {
  if (nuvionFee < 0) throw new Error('Fee cannot be negative');
  if (isNaN(nuvionFee)) throw new Error('Invalid fee amount');
  if (nuvionFee > 1000) throw new Error('Fee exceeds maximum threshold');
  
  const platformFee = parseFloat((nuvionFee * 0.15).toFixed(2));
  const totalFee = parseFloat((nuvionFee + platformFee).toFixed(2));
  
  return { platformFee, totalFee };
}
```

**Test Cases**:
```javascript
calculateCardFee(2.50) → { platformFee: 0.38, totalFee: 2.88 }
calculateCardFee(10.00) → { platformFee: 1.50, totalFee: 11.50 }
calculateCardFee(0) → { platformFee: 0, totalFee: 0 }
calculateCardFee(0.01) → { platformFee: 0.00, totalFee: 0.01 }
calculateCardFee(0.99) → { platformFee: 0.15, totalFee: 1.14 }
calculateCardFee(100) → { platformFee: 15.00, totalFee: 115.00 }
```

---

### recordCardIssuanceFee(cardId, userId, profileId, nuvionFee, platformFee, totalFee, currency): Promise<{fee_id, totalFee}>

**Purpose**: Atomically record card fee and update card record

**Parameters**:
- `cardId` (string, required): Unique card identifier
- `userId` (string, required): User identifier for audit
- `profileId` (string, required): Profile identifier (personal or business)
- `nuvionFee` (number, required): Base fee from Nuvion
- `platformFee` (number, required): Calculated platform fee
- `totalFee` (number, required): Sum of nuvion_fee and platform_fee
- `currency` (string, required): Currency code (USD, NGN, etc)

**Returns**: Promise resolving to:
```javascript
{
  fee_id: "card_fee_1704067200000_abc123",
  totalFee: 2.88,
  timestamp: 1704067200000
}
```

**Error Cases**:
- Card already has fee: Throw "Card {cardId} already has a recorded fee"
- Invalid card_id format: Throw "Invalid card_id"
- Invalid currency: Throw "Unsupported currency: {currency}"
- Database transaction failure: Throw with rollback

**Implementation Sequence**:
1. Validate card_id not empty
2. Check if card already has fee_id (reject if found)
3. Validate currency in SUPPORTED_CURRENCIES list
4. Generate fee_id: `card_fee_{Date.now()}_{randomId}`
5. BEGIN TRANSACTION
   - INSERT into card_issuance_fees
   - UPDATE cards SET fee_id, fee_charged, fee_charged_at
6. COMMIT transaction
7. On error: ROLLBACK all changes
8. Return fee record with timestamp

**Atomicity Guarantees**:
- If INSERT succeeds but UPDATE fails → ROLLBACK both
- If UPDATE succeeds but INSERT fails → ROLLBACK both
- Transaction isolation level: SQLite default (SERIALIZABLE for WAL)

---

## 3. API Endpoint Specifications

### POST /api/mobile/cards/issue

**Authentication**: Required (Bearer token via Authorization header)

**Request Body**:
```json
{
  "currency": "USD",      // Optional, defaults to user's active currency
  "context": "personal"   // Optional, defaults to user.active_context
}
```

**Query Parameters**: None

**Response (200 OK)**:
```json
{
  "success": true,
  "card": {
    "cardId": "card_1704067200000_abc1",
    "last4": "4821",
    "brand": "Visa",
    "exp_month": "12",
    "exp_year": "2028",
    "status": "active"
  },
  "fees": {
    "total_fee": 2.88
  },
  "balance_after_fee": 1247.12,
  "message": "Card issued. Fee of $2.88 deducted from balance."
}
```

**Response (400 Bad Request)**:
```json
{
  "error": "Invalid currency code",
  "details": "Supported: USD, NGN, GBP, EUR, KES, GHS, ZAR, CAD, AED"
}
```

**Response (402 Payment Required)**:
```json
{
  "error": "Insufficient balance",
  "required": 2.88,
  "available": 1.50
}
```

**Response (409 Conflict)**:
```json
{
  "error": "Card already issued for this profile",
  "existing_card_id": "card_1704000000000_xyz9"
}
```

**Response (500 Internal Server Error)**:
```json
{
  "error": "Card issuance failed",
  "details": "Database transaction failed: [error message]"
}
```

**Status Codes**:
- `200`: Card issued successfully, fee recorded, balance deducted
- `400`: Invalid input (unsupported currency, malformed request)
- `402`: Insufficient balance (user has less than total_fee)
- `409`: Conflict (card already issued for this profile in this currency)
- `500`: Server error (Nuvion API down, database error, etc)

**Rate Limiting**: TBD (recommend 1 card per user per 5 minutes)

---

## 4. Database Indexes

### Primary Indexes
```sql
-- Prevent duplicate fees per card
CREATE UNIQUE INDEX idx_card_issuance_fees_card_id ON card_issuance_fees(card_id);

-- Support fee lookup by card
CREATE INDEX idx_card_issuance_fees_card_id ON card_issuance_fees(card_id);

-- Support fee audit by user
CREATE INDEX idx_card_issuance_fees_user_id ON card_issuance_fees(user_id);

-- Support fee audit by profile (personal vs business)
CREATE INDEX idx_card_issuance_fees_profile_id ON card_issuance_fees(profile_id);

-- Support revenue reports (recent fees first)
CREATE INDEX idx_card_issuance_fees_created_at ON card_issuance_fees(created_at DESC);
```

### Query Examples
```sql
-- Get all fees for a user
SELECT * FROM card_issuance_fees WHERE user_id = ? ORDER BY created_at DESC;

-- Get fee for specific card
SELECT * FROM card_issuance_fees WHERE card_id = ?;

-- Get total fees collected in date range
SELECT SUM(total_fee) FROM card_issuance_fees 
WHERE created_at >= ? AND created_at <= ? AND status = 'charged';

-- Get fees by profile (context)
SELECT * FROM card_issuance_fees WHERE profile_id = ? ORDER BY created_at DESC;
```

---

## 5. Concurrency & Performance

### Write Concurrency Strategy
- **Technology**: SQLite WAL (Write-Ahead Logging)
- **Configuration**:
  ```javascript
  db.pragma('journal_mode = WAL');        // Enable WAL
  db.pragma('busy_timeout = 10000');      // Wait up to 10 seconds for lock
  db.pragma('synchronous = NORMAL');      // Balance safety & performance
  ```
- **Contention Point**: `card_issuance_fees` table during fee insert
- **Lock Type**: Row-level lock on card_id (UNIQUE constraint)
- **Maximum Throughput**: ~500 fee records/second with contention (SQLite WAL capacity)

### Transaction Isolation
- **Level**: SQLite WAL provides SERIALIZABLE isolation
- **Dirty Reads**: Not possible (always read committed snapshot)
- **Lost Updates**: Not possible (locks prevent concurrent writes to same card)
- **Phantom Reads**: Not possible (UNIQUE constraint on card_id)

### Performance Targets
- **Single fee recording**: < 50ms (typical)
- **50 concurrent fees**: < 200ms per request (P95)
- **Fee lookup by card_id**: < 5ms (indexed)
- **Fee lookup by user_id**: < 20ms (indexed, typically few records)

### Stress Test Results (Expected)
```
50 concurrent card issuances:
├─ Success rate: 100% (no conflicts)
├─ Total time: ~2-3 seconds
├─ P50 latency: ~150ms
├─ P95 latency: ~200ms
└─ P99 latency: ~250ms
```

---

## 6. Error Handling

### Client Errors (4xx)

| Code | Condition | Response | Retry? |
|------|-----------|----------|--------|
| 400 | Unsupported currency | "Invalid currency code" | No |
| 400 | Missing required field | "Missing field: {field}" | No |
| 400 | Invalid card_id format | "Invalid card_id" | No |
| 402 | Balance < total_fee | "Insufficient balance" | Maybe (after deposit) |
| 409 | Card already issued | "Card already issued" | No |

### Server Errors (5xx)

| Code | Condition | Response | Retry? |
|------|-----------|----------|--------|
| 500 | Nuvion API unavailable | "Card issuance service down" | Yes (exponential backoff) |
| 500 | Database transaction failed | "Transaction failed, no changes" | Yes (with new attempt) |
| 500 | Balance deduction failed | "Fee recorded but balance not deducted" (CRITICAL) | Yes (manual intervention) |

### Critical Alert Scenarios
1. **Fee recorded but balance not deducted**: Manual investigation required
   - Log: `[CRITICAL] Fee recorded but balance deduction failed`
   - Action: Check transaction rollback logic, may need manual refund

2. **Orphaned fee record**: Card deleted without fee refund
   - Implement: Cascade delete or soft delete with refund check

3. **Duplicate fee for same card**: Violates UNIQUE constraint
   - Prevention: UNIQUE(card_id) in schema
   - Log: `[ERROR] Duplicate fee attempt for card_id`

---

## 7. Backward Compatibility

### Schema Migration Strategy
- **Strategy**: Additive-only migrations (no deletions or renames)
- **Backward Compat**:
  - Existing `cards` records work fine (fee_id, fee_charged, fee_charged_at are nullable)
  - Old cards with NULL fee_id can still be used (treat as legacy)
  - New card issuance always records fee

### API Versioning
- **Version**: v1 (all responses include fees)
- **Future**: v2 could deprecate old endpoints
- **Deprecation Timeline**: None (fee recording is mandatory going forward)

### Rollback Plan
If critical bug found:
1. Stop card issuance (return 503 Service Unavailable)
2. Refund all fees from last N hours
3. Investigate root cause
4. Redeploy fix
5. Resume card issuance

---

## 8. Security Considerations

### Balance Deduction Security
- **Risk**: User balance could be manipulated if deduction fails silently
- **Mitigation**: 
  - Atomic transaction (all-or-nothing)
  - Verify balance after deduction (SELECT balance WHERE user_id = ?)
  - Alert if mismatch detected

### Fee Amount Validation
- **Risk**: Malicious input could cause integer overflow or negative fees
- **Mitigation**:
  - Validate nuvionFee is 0 ≤ x ≤ 1000 (upper bound check)
  - Use DECIMAL or REAL (not INTEGER) for fees
  - Round to 2 decimals (no pennies or smaller)

### Authorization
- **Risk**: User A could issue card for User B's profile
- **Mitigation**:
  - Verify request user_id matches card's profile user_id
  - Check active_context matches requested context
  - Log all card issuance attempts (including failed ones)

### Audit Trail
- **Required**: Log all fee transactions
  ```javascript
  {
    timestamp: Date.now(),
    action: 'CARD_ISSUANCE_FEE',
    user_id: userId,
    profile_id: profileId,
    card_id: cardId,
    fee_id: feeId,
    total_fee: totalFee,
    currency: currency,
    status: 'charged' | 'failed',
    error: null // if failed
  }
  ```

---

## 9. Monitoring & Observability

### Metrics to Emit

```javascript
// Prometheus format
card_issuance_fee_total{currency="USD", status="charged"} 2.88
card_issuance_fee_total{currency="NGN", status="charged"} 5200.00
card_issuance_total{status="success"} 1
card_issuance_total{status="failed", reason="insufficient_balance"} 1
card_issuance_duration_seconds{quantile="0.5"} 0.15
card_issuance_duration_seconds{quantile="0.95"} 0.20
card_issuance_duration_seconds{quantile="0.99"} 0.25
```

### Logging Format

```json
{
  "timestamp": "2024-01-02T10:30:45.123Z",
  "level": "info",
  "service": "mobile-api",
  "event": "card_issuance_fee_recorded",
  "user_id": "did:ethr:0x...",
  "card_id": "card_1704067200000_abc1",
  "fee_id": "card_fee_1704067200000_abc123",
  "total_fee": 2.88,
  "currency": "USD",
  "context": "personal",
  "duration_ms": 145,
  "status": "success"
}
```

### Alerts

| Alert | Condition | Action |
|-------|-----------|--------|
| HighErrorRate | Failed issuances > 5% | Page on-call |
| LowThroughput | Issuances < 10/minute during business hours | Investigate API |
| HighLatency | P95 latency > 500ms | Check database load |
| BalanceDeductionFailed | Orphaned fee record detected | Manual intervention |
| NoFeesCollected | Total_fee sum = 0 for 1 hour | Critical alert |

---

## 10. Testing Requirements

### Unit Test Coverage (calculateCardFee)
- ✅ Happy path: 2.50 → { platformFee: 0.38, totalFee: 2.88 }
- ✅ Zero fee: 0 → { platformFee: 0, totalFee: 0 }
- ✅ Edge cases: 0.01, 0.99, 1.00, 100, 1000
- ✅ Error cases: negative, NaN, > 1000

### Integration Test Coverage (full flow)
- ✅ Card issue → fee calculated → fee recorded → balance deducted
- ✅ Verify all fields populated correctly in card_issuance_fees table
- ✅ Verify cards.fee_id FK populated
- ✅ Verify balance updated (SELECT balance WHERE user_id = ?)

### Concurrency Test Coverage (50 cards)
- ✅ All 50 succeed (no collisions)
- ✅ Total fees correct: 50 × 2.88 = 144.00
- ✅ Total balance deducted: initial - 144.00
- ✅ No orphaned fee records
- ✅ No duplicate card_ids

### E2E Test Coverage (user flow)
- ✅ Click "Issue Card" button (Dashboard)
- ✅ Select currency from dropdown
- ✅ See "Fee to be charged: $2.88" display
- ✅ Click Confirm
- ✅ See success toast
- ✅ Balance updated in real-time
- ✅ Card appears in card list

### Error Test Coverage
- ✅ Insufficient balance → 402 error
- ✅ Card already issued → 409 error
- ✅ Invalid currency → 400 error
- ✅ Nuvion API down → 500 error (with retry)
- ✅ Database transaction fails → rollback (no fee, no deduction)

---

## 11. Deployment Checklist

- [ ] Database migration applied (card_issuance_fees table created)
- [ ] Column alterations applied to cards table
- [ ] Indexes created
- [ ] Backend code reviewed & merged
- [ ] Unit tests passing (100% coverage for calculateCardFee)
- [ ] Integration tests passing (full flow scenario)
- [ ] Concurrency tests passing (50 simultaneous)
- [ ] E2E tests passing (user flow in staging)
- [ ] Frontend components reviewed & merged
- [ ] OpenAPI spec updated
- [ ] Monitoring/alerting configured
- [ ] Documentation updated
- [ ] Runbook created for troubleshooting
- [ ] Staged rollout (5% canary → 25% → 100%)
- [ ] Monitor for 48 hours post-launch

---

## 12. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-01-02 | Initial design & implementation specs |
| TBD | TBD | Refund support (future enhancement) |
| TBD | TBD | Tiered pricing (future enhancement) |
