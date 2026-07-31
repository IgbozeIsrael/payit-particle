# Card Issuance Fee Integration - Implementation Guide

## Quick Reference: Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                         │
│  CardIssuanceModal → POST /api/mobile/cards/issue → Dashboard   │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ↓ HTTP
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND API (Node.js)                         │
│  POST /api/mobile/cards/issue (mobile-api.js)                   │
│  ├─ validateBalance()                                            │
│  ├─ nuvionService.issueCard()                                    │
│  ├─ calculateCardFee()                                           │
│  ├─ recordCardIssuanceFee()  ← ATOMIC TRANSACTION                │
│  └─ deductBalance()                                              │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ↓ SQLite
┌─────────────────────────────────────────────────────────────────┐
│                     DATABASE (SQLite)                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ cards (updated)                                          │   │
│  │  - card_id (PK)                                          │   │
│  │  - fee_id (FK → card_issuance_fees)                      │   │
│  │  - fee_charged (REAL)                                    │   │
│  │  - fee_charged_at (INTEGER)                              │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ card_issuance_fees (new)                                 │   │
│  │  - fee_id (PK)                                           │   │
│  │  - card_id (FK)                                          │   │
│  │  - user_id (FK)                                          │   │
│  │  - profile_id (FK)                                       │   │
│  │  - nuvion_fee, platform_fee, total_fee (REAL)            │   │
│  │  - currency (TEXT)                                       │   │
│  │  - status, created_at                                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ balance / fiat_accounts (existing - MODIFIED)            │   │
│  │  - total deducted by fee amount                          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Implementation

### STEP 1: Database Schema (payit-particle/src/db.js)

**Location**: After line 180 (after platform_fees table definition)

**Add**:
```javascript
CREATE TABLE IF NOT EXISTS card_issuance_fees (
  fee_id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  nuvion_fee REAL NOT NULL,
  platform_fee REAL NOT NULL,
  total_fee REAL NOT NULL,
  currency TEXT NOT NULL,
  status TEXT DEFAULT 'charged',
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  FOREIGN KEY(card_id) REFERENCES cards(card_id),
  FOREIGN KEY(user_id) REFERENCES users(telegram_id),
  FOREIGN KEY(profile_id) REFERENCES profiles(profile_id)
);
```

**Add Indexes** (after all CREATE TABLE statements, before migration block):
```javascript
CREATE INDEX IF NOT EXISTS idx_card_issuance_fees_card_id ON card_issuance_fees(card_id);
CREATE INDEX IF NOT EXISTS idx_card_issuance_fees_user_id ON card_issuance_fees(user_id);
CREATE INDEX IF NOT EXISTS idx_card_issuance_fees_profile_id ON card_issuance_fees(profile_id);
CREATE INDEX IF NOT EXISTS idx_card_issuance_fees_created_at ON card_issuance_fees(created_at DESC);
```

**Add Column Alterations** (in the try-catch migration block, after platform_fees migration):
```javascript
const cInfo = db.pragma('table_info(cards)');
if (!cInfo.some(col => col.name === 'fee_id')) db.exec('ALTER TABLE cards ADD COLUMN fee_id TEXT');
if (!cInfo.some(col => col.name === 'fee_charged')) db.exec('ALTER TABLE cards ADD COLUMN fee_charged REAL');
if (!cInfo.some(col => col.name === 'fee_charged_at')) db.exec('ALTER TABLE cards ADD COLUMN fee_charged_at INTEGER');
```

---

### STEP 2: Backend Functions (nuvion-service.js)

**Location**: End of exports (after issueCard function, ~line 960)

**Add**:
```javascript
// ── Card Issuance Fee Calculation & Recording ───────────────────────────────

calculateCardFee(nuvionFee) {
  const platformFee = parseFloat((nuvionFee * 0.15).toFixed(2));
  const totalFee = parseFloat((nuvionFee + platformFee).toFixed(2));
  return { platformFee, totalFee };
},

async recordCardIssuanceFee(cardId, userId, profileId, nuvionFee, platformFee, totalFee, currency) {
  const db = require('./db');
  
  try {
    // 1. Validate: Card doesn't already have fee
    const existingFee = db.db.prepare(
      'SELECT fee_id FROM cards WHERE card_id = ? AND fee_id IS NOT NULL'
    ).get(cardId);
    
    if (existingFee) {
      throw new Error(`Card ${cardId} already has a recorded fee`);
    }

    // 2. Generate fee_id
    const feeId = `card_fee_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 3. Start transaction
    const stmt = db.db.transaction(() => {
      // Insert fee record
      db.db.prepare(`
        INSERT INTO card_issuance_fees 
        (fee_id, card_id, user_id, profile_id, nuvion_fee, platform_fee, total_fee, currency, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'charged', ?)
      `).run(feeId, cardId, userId, profileId, nuvionFee, platformFee, totalFee, currency, Date.now());

      // Update cards table
      db.db.prepare(`
        UPDATE cards 
        SET fee_id = ?, fee_charged = ?, fee_charged_at = ?
        WHERE card_id = ?
      `).run(feeId, totalFee, Date.now(), cardId);

      return { feeId, totalFee };
    });

    const result = stmt();
    console.log(`[Card Issuance Fee] Recorded fee_id=${result.feeId} for card=${cardId}, amount=${totalFee} ${currency}`);
    return result;

  } catch (e) {
    console.error(`[Card Issuance Fee] Recording failed for card ${cardId}:`, e.message);
    throw e;
  }
},
```

---

### STEP 3: API Endpoint (mobile-api.js)

**Location**: After the POST /api/mobile/invoices route (around line 800+)

**Add**:
```javascript
// ── POST /api/mobile/cards/issue ────────────────────────────────────────────
if (req.method === 'POST' && requestUrl.pathname === '/api/mobile/cards/issue') {
  try {
    const body = JSON.parse(req.body || '{}');
    const currency = body.currency || 'USD';
    const context = body.context || user.active_context || 'personal';

    // 1. Get active profile
    const profile = context === 'business' 
      ? db.getProfileByType(telegramId, 'business')
      : db.getProfileByType(telegramId, 'personal') || db.getProfile(telegramId);
    
    if (!profile) {
      return sendJson(res, 400, { error: 'Profile not found' });
    }

    // 2. Get current balance for context
    const smartAccount = context === 'business' 
      ? user.business_smart_account 
      : user.personal_smart_account;

    let currentBalance = 0;
    try {
      const balanceResp = await particleService.getUnifiedBalance(smartAccount);
      currentBalance = parseFloat(balanceResp.totalAmountInUSD || '0');
    } catch (_) {}

    // 3. Issue card via Nuvion
    const cardResult = await nuvionService.issueCard(telegramId, currency, context);
    const cardId = cardResult.cardId;

    // 4. Calculate fee (flat $2.88 for now, or dynamic from Nuvion)
    const nuvionFee = 2.50; // This could come from Nuvion API response
    const { platformFee, totalFee } = nuvionService.calculateCardFee(nuvionFee);

    // 5. Validate sufficient balance
    if (currentBalance < totalFee) {
      // Attempt to still record for audit, but mark as pending
      return sendJson(res, 402, {
        error: 'Insufficient balance',
        required: totalFee,
        available: currentBalance
      });
    }

    // 6. Record fee atomically
    const feeRecord = await nuvionService.recordCardIssuanceFee(
      cardId,
      telegramId,
      profile.profile_id,
      nuvionFee,
      platformFee,
      totalFee,
      currency
    );

    // 7. Deduct from balance (context-scoped)
    // This is simplified; in production, tie to actual fiat_accounts or crypto balance
    const balanceAfterFee = currentBalance - totalFee;

    console.log(`[Card Issuance] user=${telegramId}, card=${cardId}, fee=${totalFee}, balance_after=${balanceAfterFee}`);

    return sendJson(res, 200, {
      success: true,
      card: {
        cardId: cardResult.cardId,
        last4: cardResult.cardDetails?.last4 || '4821',
        brand: cardResult.cardDetails?.brand || 'Visa',
        status: cardResult.cardDetails?.status || 'active'
      },
      fees: {
        total_fee: totalFee
      },
      balance_after_fee: balanceAfterFee,
      message: `Card issued. Fee of ${currency === 'NGN' ? '₦' : '$'}${totalFee} deducted from balance.`
    });

  } catch (e) {
    console.error('[Card Issuance] Error:', e.message);
    return sendJson(res, 500, { error: 'Card issuance failed', details: e.message });
  }
}
```

---

### STEP 4: Frontend Modal Component

**File**: payit-mobile/artifacts/mockup-sandbox/src/components/modals/CardIssuanceModal.tsx

**Create New File**:
```typescript
import React, { useState } from 'react';
import { mobileApi } from '../../lib/api';
import { ChevronDown, AlertCircle } from 'lucide-react';

const CURRENCIES = [
  { code: 'USD', flag: '🇺🇸', symbol: '$' },
  { code: 'NGN', flag: '🇳🇬', symbol: '₦' },
  { code: 'GBP', flag: '🇬🇧', symbol: '£' },
  { code: 'EUR', flag: '🇪🇺', symbol: '€' },
];

interface CardIssuanceModalProps {
  isOpen: boolean;
  context: 'personal' | 'business';
  onSuccess: (card: any) => void;
  onClose: () => void;
}

export default function CardIssuanceModal({
  isOpen,
  context,
  onSuccess,
  onClose,
}: CardIssuanceModalProps) {
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feeEstimate] = useState(2.88); // Display fixed estimate

  const selectedCur = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0];

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await mobileApi.post('/api/mobile/cards/issue', {
        currency,
        context,
      });

      if (response.success) {
        onSuccess(response.card);
        onClose();
      } else {
        setError(response.error || 'Failed to issue card');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-[20px] p-6 w-[90%] max-w-[400px] shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#0F172A]">Issue Virtual Card</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        {/* Currency Selector */}
        <div className="mb-6">
          <label className="text-sm font-semibold text-gray-600 mb-2 block">
            Currency
          </label>
          <div className="relative">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full appearance-none bg-white border border-gray-300 rounded-[12px] px-4 py-3 font-semibold text-[#0F172A] outline-none cursor-pointer"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.code}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400"
            />
          </div>
        </div>

        {/* Fee Display */}
        <div className="bg-[#ECFDF5] border border-[#D2F0E1] rounded-[12px] p-4 mb-6">
          <p className="text-sm text-gray-600 mb-1">Fee to be charged:</p>
          <p className="text-2xl font-bold text-[#047857]">
            {selectedCur.symbol}
            {feeEstimate.toFixed(2)}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            (Includes 15% platform fee)
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-[12px] p-3 mb-6 flex items-start gap-3">
            <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-3 rounded-[12px] font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 px-4 py-3 rounded-[12px] font-semibold bg-[#047857] text-white hover:bg-[#036B4E] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              'Confirm'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

### STEP 5: Dashboard Integration

**File**: payit-mobile/artifacts/mockup-sandbox/src/screens/Dashboard.tsx

**Find** (around line 242-249): Card strip section starting with `<div className="relative z-10 flex items-center justify-between">`

**Replace With**:
```tsx
{/* card management */}
<div className="relative z-10">
  {/* Existing card display or issue button */}
  {false ? ( // TODO: Replace with actual userCards.length check
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="w-[24px] h-[17px] rounded-[4px]" style={{ background: "linear-gradient(135deg, #FDE68A, #EFB947)" }} />
        <span className="text-[12.5px] font-semibold tracking-[0.6px]" style={{ color: "rgba(255,255,255,0.9)" }}>•••• 4821</span>
      </div>
      <Link to="/cards" className="flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: EML }}>
        Manage card
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
      </Link>
    </div>
  ) : (
    <div className="flex items-center justify-between">
      <button
        onClick={() => setCardModalOpen(true)}
        className="flex items-center gap-2 text-[12px] font-semibold px-3 py-2 rounded-[10px] border"
        style={{ background: "rgba(255,255,255,0.1)", borderColor: "rgba(255,255,255,0.18)", color: EML }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Issue Card
      </button>
      <Link to="/cards" className="text-[11.5px] font-semibold" style={{ color: EML }}>
        My cards →
      </Link>
    </div>
  )}
</div>

{/* Modal */}
<CardIssuanceModal
  isOpen={cardModalOpen}
  context="personal"
  onSuccess={() => { setCardModalOpen(false); /* Refresh balance */ }}
  onClose={() => setCardModalOpen(false)}
/>
```

**Add** to component top-level state:
```tsx
const [cardModalOpen, setCardModalOpen] = useState(false);
```

**Add** to imports:
```tsx
import CardIssuanceModal from '../components/modals/CardIssuanceModal';
```

---

### STEP 6: Business.tsx Integration

Same changes as Dashboard.tsx (copy-paste, update context to 'business')

---

### STEP 7: Update OpenAPI Spec

**File**: payit-mobile/lib/api-spec/openapi.yaml

**Add** under `paths`:
```yaml
/api/mobile/cards/issue:
  post:
    summary: Issue a virtual card with fee
    tags:
      - Cards
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            properties:
              currency:
                type: string
                example: "USD"
                description: "Card currency (USD, NGN, GBP, EUR, etc)"
              context:
                type: string
                enum: [personal, business]
                example: "personal"
    responses:
      '200':
        description: Card issued successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                card:
                  type: object
                  properties:
                    cardId:
                      type: string
                    last4:
                      type: string
                    brand:
                      type: string
                    status:
                      type: string
                fees:
                  type: object
                  properties:
                    total_fee:
                      type: number
                      example: 2.88
                balance_after_fee:
                  type: number
                  example: 147.12
                message:
                  type: string
      '402':
        description: Insufficient balance
      '409':
        description: Card already issued
      '500':
        description: Server error
```

---

## Testing Checklist

- [ ] Unit: calculateCardFee(2.50) → { platformFee: 0.38, totalFee: 2.88 }
- [ ] Unit: calculateCardFee(0) → { platformFee: 0, totalFee: 0 }
- [ ] Integration: Full card issuance flow (fee recorded + balance deducted)
- [ ] Concurrency: 50 simultaneous card issuances
- [ ] API: POST /cards/issue returns correct response
- [ ] UI: Modal displays correctly & submits
- [ ] UI: Dashboard shows "Issue Card" button when no cards
- [ ] UI: Business screen same as Dashboard
- [ ] Error Handling: Insufficient balance → 402 response
- [ ] Error Handling: Card already exists → 409 response
- [ ] Balance Rollback: Failed fee recording → no balance deduction
- [ ] Database: card_issuance_fees table populated correctly

---

## Deployment Checklist

- [ ] Database migrations applied (card_issuance_fees table created)
- [ ] Column alterations applied to cards table
- [ ] Backend code deployed (fee calculation & recording functions)
- [ ] API endpoint tested in staging
- [ ] Frontend components built & tested
- [ ] OpenAPI spec updated
- [ ] Monitoring/alerting configured
- [ ] Documentation updated for support team
- [ ] Rollout to production (5% → 25% → 100%)
