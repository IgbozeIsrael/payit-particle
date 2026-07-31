# Card Issuance Fee Integration - Complete Design

## 1. ARCHITECTURAL DECISIONS

### A. Database Strategy
- **Technology**: SQLite with WAL mode (existing)
- **Isolation**: Separate `card_issuance_fees` table to maintain ACID compliance under high concurrency
- **Indexing**: Primary key on fee_id, composite index on (card_id, created_at) for time-based queries
- **Schema Evolution**: Migrations applied via ALTER TABLE with NOT NULL defaults to prevent breaking existing cards table

### B. Fee Calculation Model
- **Formula**: `platformFee = nuvionFee × 0.15` (15% markup)
- **Total**: `totalFee = nuvionFee + platformFee`
- **Currency Handling**: Store fees in user's selected currency (NGN/USD/etc), convert if needed
- **Rounding**: Round platform fees to 2 decimal places using ROUND(x, 2) in SQL

### C. Balance Deduction Strategy
- **Timing**: Deduct fee immediately after card issuance confirmation
- **Atomicity**: Single transaction wrapping (record fee → deduct balance → update card)
- **Rollback**: On failure, delete fee record to avoid orphaned fees
- **Lock Strategy**: Use database row-level locking (PRAGMA busy_timeout)

### D. API Response Design
- **Field Mapping**: Return ONLY total_fee to UI (not breakdown) for simplicity
- **Context Scoping**: Balance deducted from active profile context (personal or business)
- **Idempotency**: Card ID uniqueness prevents duplicate fees
- **Error Codes**: 402 Payment Required (insufficient balance), 409 Conflict (card exists)

---

## 2. DATABASE SCHEMA CHANGES

### New Table: card_issuance_fees
```sql
CREATE TABLE IF NOT EXISTS card_issuance_fees (
  fee_id TEXT PRIMARY KEY,          -- card_fee_{timestamp}_{uuid}
  card_id TEXT NOT NULL UNIQUE,     -- FK to cards.card_id
  user_id TEXT NOT NULL,            -- For audit/analytics
  profile_id TEXT NOT NULL,         -- Scoping: personal or business
  nuvion_fee REAL NOT NULL,         -- Fee from Nuvion ($/equivalent)
  platform_fee REAL NOT NULL,       -- PayIT markup (15%)
  total_fee REAL NOT NULL,          -- Sum: nuvion + platform
  currency TEXT NOT NULL,           -- NGN, USD, GBP, etc
  status TEXT DEFAULT 'charged',    -- charged, refunded, pending
  created_at INTEGER NOT NULL,      -- Unix timestamp
  updated_at INTEGER,               -- For refund tracking
  FOREIGN KEY(card_id) REFERENCES cards(card_id),
  FOREIGN KEY(user_id) REFERENCES users(telegram_id),
  FOREIGN KEY(profile_id) REFERENCES profiles(profile_id)
);
CREATE INDEX idx_card_issuance_fees_card_id ON card_issuance_fees(card_id);
CREATE INDEX idx_card_issuance_fees_user_id ON card_issuance_fees(user_id);
CREATE INDEX idx_card_issuance_fees_profile_id ON card_issuance_fees(profile_id);
CREATE INDEX idx_card_issuance_fees_created_at ON card_issuance_fees(created_at DESC);
```

### Updated: cards Table
```sql
ALTER TABLE cards ADD COLUMN fee_id TEXT;              -- FK to card_issuance_fees
ALTER TABLE cards ADD COLUMN fee_charged REAL;         -- Cache: total_fee deducted
ALTER TABLE cards ADD COLUMN fee_charged_at INTEGER;   -- Timestamp of deduction
-- Create foreign key constraint
ALTER TABLE cards ADD CONSTRAINT fk_cards_fee_id 
  FOREIGN KEY (fee_id) REFERENCES card_issuance_fees(fee_id);
```

---

## 3. BACKEND FUNCTIONS (nuvion-service.js)

### Function: calculateCardFee(nuvionFee)
**Purpose**: Compute platform fee and total
**Input**: nuvionFee (number) - Nuvion's quoted fee
**Output**: { platformFee, totalFee }
**Implementation**:
```javascript
calculateCardFee(nuvionFee) {
  const platformFee = parseFloat((nuvionFee * 0.15).toFixed(2));
  const totalFee = parseFloat((nuvionFee + platformFee).toFixed(2));
  return { platformFee, totalFee };
}
```
**Test Case**: calculateCardFee(2.50) → { platformFee: 0.38, totalFee: 2.88 }

### Function: recordCardIssuanceFee(cardId, userId, profileId, nuvionFee, platformFee, totalFee, currency)
**Purpose**: Record fee in database + apply balance deduction
**Transaction Flow**:
  1. Validate: Card doesn't already have a fee (SELECT fee_id FROM cards WHERE card_id = ?)
  2. Validate: User has sufficient balance in active context
  3. Insert into card_issuance_fees (atomic INSERT)
  4. Update cards table: SET fee_id = ?, fee_charged = ?, fee_charged_at = ?
  5. Deduct from balance (context-scoped profile's balance column)
  6. Return: { fee_id, totalFee, balanceAfter }
  7. On error: Rollback all changes

**Implementation Location**: lib/nuvion-service.js (new export)

---

## 4. API ENDPOINT ENHANCEMENT (mobile-api.js)

### Endpoint: POST /api/mobile/cards/issue
**Request Body**:
```json
{
  "currency": "USD",
  "context": "personal"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "card": {
    "cardId": "card_1734567890_abc1",
    "last4": "4821",
    "brand": "Visa",
    "status": "active"
  },
  "fees": {
    "total_fee": 2.88
  },
  "balance_after_fee": 1247.12,
  "message": "Card issued. Fee of $2.88 deducted from balance."
}
```

**Error Responses**:
- 402 Payment Required: { "error": "Insufficient balance" }
- 409 Conflict: { "error": "Card already issued for this profile" }
- 500 Internal Server Error: { "error": "Fee recording failed" }

**Implementation**:
- Route handler in mobile-api.js (line ~130+)
- Call nuvionService.issueCard() → get nuvionFee from response
- Calculate fee using calculateCardFee()
- Record fee via recordCardIssuanceFee()
- Deduct from balance atomically
- Return formatted response

---

## 5. UI MODAL COMPONENT (CardIssuanceModal.tsx)

**Location**: src/components/modals/CardIssuanceModal.tsx
**Props**:
```typescript
interface CardIssuanceModalProps {
  isOpen: boolean;
  context: 'personal' | 'business';
  onSuccess: (card: Card) => void;
  onError: (error: Error) => void;
  onClose: () => void;
}
```

**Features**:
1. Currency selector (dropdown: NGN, USD, GBP, etc)
2. Display: "Fee to be charged: $X.XX" (TOTAL FEE ONLY)
3. Two buttons: "Confirm" (primary), "Cancel" (secondary)
4. Loading state during API call
5. Error toast on failure (insufficient balance, etc)
6. Success toast + redirect on completion

**Example UI**:
```
┌─────────────────────────────────────────┐
│ Issue Virtual Card                    ✕ │
├─────────────────────────────────────────┤
│ Currency: [USD ▼]                       │
│                                         │
│ Fee to be charged: $2.88                │
│ (15% platform markup included)          │
│                                         │
│ Current Balance: $150.00                │
│ Balance After: $147.12                  │
├─────────────────────────────────────────┤
│ [Cancel]              [Confirm]         │
└─────────────────────────────────────────┘
```

---

## 6. DASHBOARD INTEGRATION

### Dashboard.tsx (Replace lines 242-249)
**Current (Card Strip)**:
```tsx
<div className="relative z-10 flex items-center justify-between">
  <div className="flex items-center gap-2.5">
    <div className="w-[24px] h-[17px] rounded-[4px]" style={{ background: "..." }} />
    <span>•••• 4821</span>
  </div>
  <Link to="/cards">Manage card</Link>
</div>
```

**Updated**:
```tsx
<div className="relative z-10 flex items-center justify-between">
  <div className="flex items-center gap-2.5">
    {userCards.length > 0 ? (
      <>
        <div className="w-[24px] h-[17px] rounded-[4px]" style={{ background: "..." }} />
        <span>•••• {userCards[0].last4}</span>
      </>
    ) : (
      <button onClick={() => setCardModalOpen(true)} className="flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: EML }}>
        <Plus size={14} /> Issue Card
      </button>
    )}
  </div>
  <Link to="/cards" className="flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: EML }}>
    Manage cards
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
  </Link>
</div>
```

### Business.tsx (Same Pattern)
- Add CardIssuanceModal component
- Replace card strip with "Issue Card" button if no cards exist
- Show first card (last4) and "Manage cards" link if cards exist

---

## 7. TESTING COVERAGE

### Unit Tests (calculateCardFee)
```javascript
test('calculateCardFee(2.50) returns correct fee', () => {
  const result = calculateCardFee(2.50);
  expect(result.platformFee).toBe(0.38);
  expect(result.totalFee).toBe(2.88);
});

test('calculateCardFee(10.00) returns correct fee', () => {
  const result = calculateCardFee(10.00);
  expect(result.platformFee).toBe(1.50);
  expect(result.totalFee).toBe(11.50);
});

test('calculateCardFee(0) returns zero fees', () => {
  const result = calculateCardFee(0);
  expect(result.platformFee).toBe(0);
  expect(result.totalFee).toBe(0);
});
```

### Integration Tests (Full Issuance Flow)
```javascript
test('Complete issuance: fee recorded + balance deducted', async () => {
  const userId = 'test_user_123';
  const initialBalance = 1000;
  
  // Setup
  setUserBalance(userId, initialBalance);
  
  // Execute
  const result = await issueCardWithFee(userId, 'USD', 'personal');
  
  // Assert
  expect(result.card.cardId).toBeDefined();
  expect(result.fees.total_fee).toBe(2.88);
  
  const feeRecord = getCardIssuanceFee(result.card.cardId);
  expect(feeRecord.status).toBe('charged');
  
  const finalBalance = getUserBalance(userId);
  expect(finalBalance).toBe(initialBalance - 2.88);
});
```

### Concurrency Tests (50 Simultaneous Issuances)
```javascript
test('50 concurrent card issuances maintain fee integrity', async () => {
  const userId = 'concurrent_test_user';
  const initialBalance = 10000; // Enough for all 50 cards
  setUserBalance(userId, initialBalance);
  
  // Fire 50 concurrent requests
  const promises = [];
  for (let i = 0; i < 50; i++) {
    promises.push(issueCardWithFee(userId, 'USD', 'personal'));
  }
  
  const results = await Promise.allSettled(promises);
  
  // Validate
  const successCount = results.filter(r => r.status === 'fulfilled').length;
  expect(successCount).toBe(50);
  
  // Check total fees recorded
  const totalFees = db.exec('SELECT SUM(total_fee) as total FROM card_issuance_fees WHERE user_id = ?', [userId]);
  const expectedTotal = 50 * 2.88; // Assuming $2.88 per card
  expect(totalFees[0]).toBe(expectedTotal);
  
  // Verify balance deducted
  const finalBalance = getUserBalance(userId);
  expect(finalBalance).toBeCloseTo(initialBalance - expectedTotal, 2);
});
```

---

## 8. FILE-BY-FILE IMPLEMENTATION ROADMAP

### Phase 1: Database & Backend Core
1. **lib/db/src/schema/card-issuance-fees.ts** (NEW)
   - Define Drizzle table: cardIssuanceFeesTable
   - Define insert & select schemas
   - Export types: InsertCardIssuanceFee, CardIssuanceFee

2. **payit-particle/src/db.js** (MODIFY)
   - Add CREATE TABLE card_issuance_fees to schema initialization
   - Add ALTER TABLE cards (fee_id, fee_charged, fee_charged_at)
   - Add indexes for performance

3. **payit-particle/src/nuvion-service.js** (ADD)
   - Export: calculateCardFee(nuvionFee)
   - Export: recordCardIssuanceFee(cardId, userId, profileId, nuvionFee, platformFee, totalFee, currency)
   - Integrate into existing issueCard() function

### Phase 2: API Layer
4. **payit-particle/src/mobile-api.js** (MODIFY)
   - Add POST /api/mobile/cards/issue route handler
   - Call nuvionService.issueCard()
   - Calculate fee & record atomically
   - Return fee breakdown in response

5. **lib/api-spec/openapi.yaml** (MODIFY)
   - Add POST /cards/issue endpoint spec
   - Define request/response schemas
   - Document fee fields

### Phase 3: Frontend Components
6. **payit-mobile/artifacts/mockup-sandbox/src/components/modals/CardIssuanceModal.tsx** (NEW)
   - Currency selector
   - Fee display (total only)
   - Confirm/Cancel buttons
   - Error handling

7. **payit-mobile/artifacts/mockup-sandbox/src/screens/Dashboard.tsx** (MODIFY)
   - Replace card strip section with CardIssuanceModal integration
   - Add "Issue Card" button

8. **payit-mobile/artifacts/mockup-sandbox/src/screens/Business.tsx** (MODIFY)
   - Same changes as Dashboard.tsx but for business context

### Phase 4: Testing
9. **payit-particle/tests/card-issuance-fee.test.js** (NEW)
   - Unit tests for calculateCardFee
   - Integration tests for full flow
   - Concurrency tests (50 simultaneous)

10. **payit-particle/tests/e2e/card-issuance.e2e.js** (NEW)
    - End-to-end card issuance scenario
    - Verify fee deduction & balance update

---

## 9. IMPLEMENTATION SEQUENCE & DEPENDENCIES

```
Day 1: Core Backend (Files 1-3)
  ├─ Define Drizzle schema
  ├─ Update SQLite schema + migrations
  └─ Implement fee calculation & recording functions

Day 2: API Integration (Files 4-5)
  ├─ Implement POST /cards/issue endpoint
  ├─ Add to OpenAPI spec
  └─ Manual testing with Postman

Day 3: Frontend (Files 6-8)
  ├─ Build CardIssuanceModal component
  ├─ Integrate into Dashboard
  ├─ Integrate into Business screen
  └─ UI/UX testing

Day 4: Testing & QA (Files 9-10)
  ├─ Write & run unit tests
  ├─ Write & run integration tests
  ├─ Execute concurrency audit (50 cards)
  └─ Bug fixes & refinement
```

---

## 10. RISK MITIGATION

| Risk | Mitigation |
|------|-----------|
| **Race conditions on balance deduction** | Use SQLite PRAGMA busy_timeout (10s), transaction locks, test with 50 concurrent requests |
| **Orphaned fee records** | Implement rollback logic: if balance deduction fails, delete fee record |
| **Fee calculation rounding errors** | Always use ROUND(x, 2) in SQL, test with edge cases (0.01, 0.99, etc) |
| **User confusion (seeing platform fee)** | Return only total_fee to UI, hide breakdown. Document in support FAQ |
| **API downtime during card issuance** | Idempotent design: card_id uniqueness + fee_id uniqueness prevent double-charging |
| **Balance state inconsistency** | Atomic transaction: (record fee → update cards → deduct balance) all-or-nothing |

---

## 11. MONITORING & OBSERVABILITY

- **Metrics to Track**:
  - Total platform fees collected (daily, monthly)
  - Card issuance success rate (%)
  - Average fee per card issued
  - Failed issuances (reason breakdown)

- **Logs to Implement**:
  - [Card Issuance] User {userId} issued card: cardId={cardId}, fee={totalFee}
  - [Fee Recording] Fee recorded: fee_id={feeId}, status=charged
  - [Balance Deduction] Context={context}, balance_before={before}, balance_after={after}

- **Alerting**:
  - Alert if issuance success rate drops below 95%
  - Alert if fee recording errors exceed 1% of attempts

---

## 12. FUTURE ENHANCEMENTS

1. **Fee Refunds**: Add refund_fee() function if card is canceled within 30 days
2. **Tiered Pricing**: Adjust platform fee based on user tier (Starter, Pro, Enterprise)
3. **Bulk Issuance**: Add batch card issuance endpoint with cumulative fee discount
4. **Fee Analytics**: Dashboard showing user's historical fee spending
5. **A/B Testing**: Test different fee percentages (12%, 15%, 18%) with user segments
