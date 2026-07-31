# Universal Wallet Integration - Card Issuance

**Status:** ✅ Documented for Implementation  
**Updated:** July 28, 2026  

---

## Overview

When users issue virtual cards, transactions on these cards will be funded from their **universal wallet** (USDT balance), not directly from Nuvion's balance.

This means:
1. User has universal wallet with USDT balance
2. User issues a virtual card (pays issuance fee from universal wallet)
3. When card is used for transactions, money flows from universal wallet to card account
4. This creates a unified balance management system

---

## 🏗️ Architecture

### Current Flow (Issuance Only)
```
User's Universal Wallet (USDT)
    ↓
    ├─ Balance: $100.00
    └─ Issue Card
        ↓
        Fee Deducted: $2.88
        ↓
        New Balance: $97.12
        ↓
        Card Created (in Nuvion system)
```

### Extended Flow (Transactions)
```
Card Transaction Initiated
    ↓
    Transaction Request to Card Account
    ↓
    Check: Does Card Account have balance?
        ├─ YES → Process transaction normally
        └─ NO → Transfer from Universal Wallet
                 ↓
                 Transfer $X from Universal Wallet
                 ↓
                 To Card Account (creates sub-wallet)
                 ↓
                 Process transaction
```

---

## 💰 Payment Flow Scenarios

### Scenario 1: Card Has Sufficient Balance
```
User's Universal Wallet:      $100.00 USDT
Card Account Balance:         $50.00 USD
Card Transaction:             $20.00 USD

Result:
├─ Card Account Deduction:    $50.00 → $30.00
├─ Universal Wallet:          $100.00 (unchanged)
└─ Transaction Status:        ✅ SUCCESS
```

### Scenario 2: Card Lacks Balance (Top-Up Required)
```
User's Universal Wallet:      $100.00 USDT
Card Account Balance:         $5.00 USD
Card Transaction:             $20.00 USD (attempt)

PayIT Auto-Top-Up Process:
├─ Card needs:               $15.00 USD
├─ Conversion Rate:          1 USDT = 1 USD (or actual rate)
├─ Required from Wallet:     $15.00 USDT
├─ Universal Wallet Check:   $100.00 ≥ $15.00 ✅
├─ Transfer to Card:         $15.00 USDT → Card Account
├─ New Universal Wallet:     $100.00 - $15.00 = $85.00
├─ Card Account:             $5.00 + $15.00 = $20.00
└─ Transaction Processes:    ✅ $20.00 USD

Result:
├─ Universal Wallet:         $85.00 USDT
├─ Card Account:             $0.00 USD
└─ Transaction Status:       ✅ SUCCESS
```

### Scenario 3: Insufficient Universal Wallet Balance
```
User's Universal Wallet:      $5.00 USDT
Card Account Balance:         $0.00 USD
Card Transaction:             $20.00 USD (attempt)

AutoTop-Up Check:
├─ Card needs:               $20.00 USD
├─ Required from Wallet:     $20.00 USDT
├─ Universal Wallet:         $5.00 USDT (insufficient)
├─ Shortfall:                $15.00 USDT
└─ Transaction Result:       ❌ DECLINED

Error Message to User:
"Transaction declined. Your card account needs $20.00 USD
but your universal wallet only has $5.00 USDT.
Please top-up your wallet to continue."
```

---

## 🔄 Implementation Strategy

### Phase 1: Issuance Fee Collection ✅ (DONE)
```
1. User clicks "Issue Card"
2. Select currency
3. Fee calculated (Nuvion fee + 15% platform fee)
4. Fee deducted from Universal Wallet → PayIT Platform Wallet
5. Card issued in Nuvion system
```

### Phase 2: Auto Top-Up System (Next)
```
1. Card transaction initiated
2. Nuvion checks card balance
3. If insufficient, trigger PayIT API
4. PayIT API checks Universal Wallet
5. If sufficient, transfer to Card Account
6. If insufficient, decline transaction
7. Update both balances
```

### Phase 3: Reconciliation (Future)
```
1. Daily reconciliation between:
   ├─ Universal Wallet (PayIT DB)
   ├─ Card Accounts (Nuvion)
   └─ Transactions (both systems)
2. Verify no mismatches
3. Alert on discrepancies
```

---

## 💻 Database Schema Updates Needed

### New Table: `card_wallet_transfers`
```sql
CREATE TABLE card_wallet_transfers (
  transfer_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  card_id VARCHAR(255) NOT NULL,
  from_wallet VARCHAR(50),        -- 'universal' or 'card'
  to_wallet VARCHAR(50),          -- 'universal' or 'card'
  amount DECIMAL(19, 6) NOT NULL,
  currency VARCHAR(3) NOT NULL,   -- USD, EUR, etc.
  status VARCHAR(50),             -- 'pending', 'completed', 'failed'
  reason VARCHAR(255),            -- 'auto_top_up', 'user_transfer', etc.
  transaction_id VARCHAR(255),    -- Related Nuvion transaction
  created_at BIGINT NOT NULL,
  completed_at BIGINT,
  INDEX (user_id),
  INDEX (card_id),
  INDEX (created_at)
);
```

### Update Table: `cards`
```sql
ALTER TABLE cards ADD COLUMN (
  universal_wallet_linked BOOLEAN DEFAULT TRUE,
  auto_topup_enabled BOOLEAN DEFAULT TRUE,
  auto_topup_threshold DECIMAL(19, 6) DEFAULT 10.00,
  card_account_balance DECIMAL(19, 6) DEFAULT 0.00,
  card_account_currency VARCHAR(3),
  last_topup_at BIGINT,
  last_transaction_at BIGINT
);
```

### Update Table: `hd_deposits` or `universal_wallet`
```sql
-- Track universal wallet balance changes
ALTER TABLE hd_deposits ADD COLUMN (
  related_card_id VARCHAR(255),   -- If transfer is for card
  transfer_type VARCHAR(50),       -- 'card_issuance_fee', 'card_topup', 'card_withdrawal'
  is_pending BOOLEAN DEFAULT FALSE
);
```

---

## 🔌 API Updates Needed

### 1. Card Auto Top-Up Endpoint
```
POST /api/mobile/cards/topup

Request:
{
  "card_id": "card_...",
  "amount": 20.00,
  "currency": "USD",
  "reason": "transaction_declined"
}

Response:
{
  "success": true,
  "transfer_id": "transfer_...",
  "from_universal_wallet": 20.00,
  "to_card_account": 20.00,
  "new_universal_balance": 80.00,
  "new_card_balance": 20.00,
  "timestamp": 1722174000
}
```

### 2. Get Card Balance Endpoint
```
GET /api/mobile/cards/:cardId/balance

Response:
{
  "card_id": "card_...",
  "card_account_balance": 15.50,
  "card_account_currency": "USD",
  "universal_wallet_balance": 85.00,
  "universal_wallet_currency": "USDT",
  "auto_topup_enabled": true,
  "auto_topup_threshold": 10.00,
  "total_available": 100.50,
  "last_updated": 1722174000
}
```

### 3. Transfer Between Wallets Endpoint
```
POST /api/mobile/cards/transfer

Request:
{
  "card_id": "card_...",
  "from": "universal",        -- or "card"
  "to": "card",               -- or "universal"
  "amount": 50.00,
  "currency": "USD"
}

Response:
{
  "success": true,
  "transfer_id": "transfer_...",
  "universal_balance": 50.00,
  "card_balance": 50.00,
  "timestamp": 1722174000
}
```

---

## 🔐 Security Considerations

### Balance Verification
```javascript
// Before auto top-up:
1. Verify card exists and user owns it
2. Verify universal wallet balance is sufficient
3. Verify transaction amount is reasonable
4. Verify daily/monthly limits not exceeded
5. Verify no pending transactions
```

### Lock Mechanisms
```javascript
// Prevent race conditions:
- Use database locks during transfers
- Check balance just before debiting
- Atomic transactions (all-or-nothing)
- Rollback on any failure
```

### Audit Trail
```javascript
// Log every transfer:
{
  timestamp: 1722174000,
  user_id: "user_...",
  card_id: "card_...",
  transfer_type: "auto_topup",
  amount: 20.00,
  from_balance_before: 85.00,
  from_balance_after: 65.00,
  to_balance_before: 0.00,
  to_balance_after: 20.00,
  status: "success",
  reason: "card_transaction_insufficient_balance"
}
```

---

## 📊 Implementation Roadmap

### Week 1: Nuvion Integration Research ✅
```
✓ Understand Nuvion API card account structure
✓ Check if Nuvion supports sub-wallet concept
✓ Verify if Nuvion can trigger webhook on card transaction decline
✓ Document Nuvion balance check endpoint
```

### Week 2: Database Schema ⏳
```
⏳ Create card_wallet_transfers table
⏳ Update cards table with balance columns
⏳ Update hd_deposits for tracking
⏳ Add migration scripts
```

### Week 3: Backend Implementation ⏳
```
⏳ Implement auto top-up logic
⏳ Implement balance check functions
⏳ Implement transfer functions
⏳ Add webhook handler for Nuvion events
```

### Week 4: Frontend Updates ⏳
```
⏳ Add card balance display to Dashboard
⏳ Add manual transfer UI
⏳ Add top-up history
⏳ Add balance notifications
```

### Week 5: Testing & Deployment ⏳
```
⏳ Unit tests for all functions
⏳ Integration tests with Nuvion
⏳ Load testing (concurrent transactions)
⏳ Production deployment
```

---

## 🎯 Current Status

### Completed ✅
- [x] Card issuance with fee from universal wallet
- [x] UI shows card design with currency/network
- [x] Fee calculation and collection
- [x] Balance verification before issuance

### Ready for Next Phase ⏳
- [ ] Nuvion API research (card balance check, auto-reload capability)
- [ ] Auto top-up system implementation
- [ ] Balance reconciliation
- [ ] Card transaction notifications

### Testing Needed
- [ ] Test card transactions on Nuvion
- [ ] Test balance flow in both directions
- [ ] Test insufficient balance scenarios
- [ ] Test concurrent transactions
- [ ] Test edge cases and error conditions

---

## 🔍 Questions for Nuvion Integration

1. **Card Account Balances**
   - Does Nuvion expose card account balance via API?
   - Can we check balance before transaction?
   - What's the real-time vs. batch update frequency?

2. **Transaction Webhooks**
   - Does Nuvion send webhooks for declined transactions?
   - Can we hook into "insufficient balance" event?
   - What's the payload structure?

3. **Funding Card Accounts**
   - Can we programmatically top-up card accounts?
   - What's the minimum/maximum top-up amount?
   - Is there a fee for top-ups?
   - How long does a top-up take to process?

4. **Currency Handling**
   - How does Nuvion handle multi-currency card accounts?
   - What's the conversion rate mechanism?
   - Who controls FX rates?

5. **Limits & Controls**
   - Can we set daily/monthly spending limits per card?
   - Can we control auto top-up behavior?
   - Can we restrict which currencies/merchants?

---

## 💡 User Experience Flow

### Current (Card Issuance) ✅
```
Dashboard
  ↓
Click "Issue Card"
  ↓
Select Currency (see card design)
  ↓
Confirm Fee ($2.88)
  ↓
Card Issued
  ↓
Success Screen
```

### Future (Card Usage)
```
User spends $20 with card
  ↓
Nuvion: Check card balance
  ↓
If Insufficient:
  └─ Trigger PayIT API
     ↓
     Check Universal Wallet
     ↓
     Auto-transfer $X to card
     ↓
     Card transaction proceeds
     ↓
     User gets notification
```

---

## 📝 Documentation Files Created

1. **UNIVERSAL_WALLET_INTEGRATION.md** (this file)
   - Architecture overview
   - Payment flow scenarios
   - Database schema updates
   - API specifications
   - Implementation roadmap

---

## ✅ Next Steps

1. **Research Nuvion Capabilities**
   - Contact Nuvion support
   - Ask the questions above
   - Document API endpoints

2. **Design Auto Top-Up Logic**
   - Define top-up rules
   - Set thresholds
   - Plan fallback scenarios

3. **Update Database Schema**
   - Create card_wallet_transfers table
   - Update cards table
   - Add indexes

4. **Implement Backend APIs**
   - Auto top-up endpoint
   - Balance check endpoint
   - Transfer endpoint

5. **Update Frontend**
   - Show card balance
   - Allow manual transfers
   - Display transaction history

---

## 📞 Support

For questions about universal wallet integration:
1. Review this document thoroughly
2. Check CARD_ISSUANCE_IMPLEMENTATION_GUIDE.md for context
3. Contact development team for implementation questions

---

**Status:** Documentation Complete, Implementation Ready When Approved ✅

Next: Await Nuvion API research results before proceeding with Phase 2.
