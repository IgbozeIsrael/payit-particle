# Card Issuance Implementation - Testing Guide

## Quick Start

### 1. Start Backend Server
```bash
cd payit-particle/payit-particle
npm run dev
# Backend runs on http://localhost:3000
```

### 2. Start Frontend Dev Server
```bash
cd payit-mobile/artifacts/mockup-sandbox
npm run dev
# Frontend runs on http://localhost:5173
```

### 3. Access the App
- Open http://localhost:5173 in your browser
- Navigate to Dashboard (Personal Account)
- Look for "Issue card" button in the balance card

## Testing Scenarios

### Scenario 1: Issue a Disposable Card (One-Time)
1. Click "Issue card" button
2. Select **One-Time Card** (Disposable)
3. Verify fee shows $0.58 (or $0.50 from Nuvion + 15% platform fee)
4. Select currency (e.g., USD)
5. Verify card design preview shows:
   - PayIT gradient background
   - Masked card number (•••• •••• •••• XXXX)
   - Cardholder: "PayIT User"
   - Expiry: 12/28
   - Network: Visa/Mastercard based on currency
6. Click Continue → Review fee → Confirm
7. Wait for success screen with card ID and last 4 digits

### Scenario 2: Issue a Virtual Card (Reusable) with Controls
1. Click "Issue card" button
2. Select **Reusable Card** (Virtual)
3. Verify fee shows $2.88 (or $2.50 from Nuvion + 15% platform fee)
4. ✅ **Spending Controls Step** appears (unique to virtual):
   - Set monthly spending limit: $500 (or leave empty for unlimited)
   - Restrict merchant categories: Check "Gas Stations" + "International"
5. Select currency (e.g., EUR)
6. Verify card design shows EUR currency with Mastercard network
7. Click Continue → Review fee → Confirm
8. Verify success screen shows the virtual card details

### Scenario 3: Try Physical Card (Should be Blocked)
1. Click "Issue card" button
2. Select **Physical Card**
3. Verify alert: "Physical cards will be available soon"
4. Physical card option disabled in confirm button
5. Can click back to select another type

### Scenario 4: Insufficient Balance Test
1. Set user balance to $1.00 (or less than required fee)
2. Try to issue any card (e.g., Disposable = $0.58 fee)
3. Verify error message shows:
   - Required balance: $0.58
   - Current balance: $1.00 (or less)
   - Option to go back and add money

### Scenario 5: Test All Currencies
For each currency (USD, EUR, GBP, NGN, KES, GHS, ZAR, CAD, AED):
1. Issue a virtual card
2. Verify card preview updates:
   - Currency flag (🇺🇸, 🇪🇺, 🇬🇧, 🇳🇬, 🇰🇪, 🇬🇭, 🇿🇦, 🇨🇦, 🇦🇪)
   - Currency code displayed
   - Correct network (Visa or Mastercard)

### Scenario 6: Business Account Integration
1. Switch to Business account
2. Click "Issue card" button
3. Verify same card type selection flow
4. Select Virtual card
5. Verify context is 'business' in API call
6. Confirm card issuance

### Scenario 7: Mobile Responsiveness Check
Test on different screen widths:
- **320px** (iPhone 5): All elements should fit, no horizontal scroll
- **390px** (iPhone 12): Primary container, fully responsive
- **800px** (iPad): Tablet layout, clean spacing
- **1024px** (Desktop): Full layout

Verify:
- [ ] Card selection buttons are clickable
- [ ] Card design preview is visible and centered
- [ ] Currency grid fits without wrapping
- [ ] All text is readable (no cutoff)
- [ ] Fee display is prominent
- [ ] Balance warning (if any) is visible

## API Testing with curl

### Test Card Issuance Endpoint
```bash
curl -X POST http://localhost:3000/api/mobile/cards/issue \
  -H "Content-Type: application/json" \
  -d '{
    "card_type": "virtual",
    "currency": "USD",
    "context": "personal",
    "spending_limit": 500,
    "merchant_controls": ["Gas Stations", "International"]
  }'
```

### Expected Response (Success)
```json
{
  "success": true,
  "message": "Virtual card issued successfully with controls",
  "card": {
    "cardId": "card_abc123xyz",
    "last4": "4821",
    "cardDetails": {
      "type": "virtual",
      "currency": "USD"
    }
  },
  "fees": {
    "nuvion_fee": 2.50,
    "platform_fee": 0.38,
    "total_fee": 2.88
  },
  "balance": {
    "before": 100.00,
    "after": 97.12
  }
}
```

### Expected Response (Insufficient Balance)
```json
{
  "success": false,
  "error": "Insufficient balance. Virtual card fee is $2.88, but you only have $2.00 USDT.",
  "required_balance": 2.88,
  "current_balance": 2.00,
  "card_type": "virtual",
  "fee_breakdown": {
    "nuvion_fee": 2.50,
    "platform_fee": 0.38,
    "total_fee": 2.88
  }
}
```

## Component Inspection

### CardTypeSelection Component
**Props**:
- `onSelectCardType`: (cardType: 'disposable' | 'virtual' | 'physical') => void
- `onClose`: () => void

**Features**:
- ✓ Three card type cards with icons (Zap, RotateCcw, Package)
- ✓ Fee display per card type
- ✓ Features list with bullet points
- ✓ "Recommended" badge on Virtual card
- ✓ "Coming Soon" badge on Physical card
- ✓ Quick guide showing use cases
- ✓ PayIT design tokens applied

### CardIssuanceModal Component
**Props**:
- `open`: boolean
- `onOpenChange`: (open: boolean) => void
- `userBalance`: number (USDT)
- `context`: 'personal' | 'business'
- `onCardIssued`: (cardData) => void

**States**:
- 'card_type_select'
- 'spending_controls' (Virtual only)
- 'currency_select'
- 'fee_confirmation'
- 'processing'
- 'success'
- 'error'

## Debug Tips

### Enable Network Logging
Open browser DevTools (F12) → Network tab
- Monitor POST /api/mobile/cards/issue requests
- Check request payload for card_type, spending_limit, merchant_controls
- Verify response includes fee breakdown and balance update

### Check Component State
In console:
```javascript
// React DevTools recommended for inspecting component state
// Look for CardIssuanceModal component state:
// - selectedCardType
// - selectedCurrency
// - spendingLimit
// - merchantControls
// - step (current flow step)
```

### Verify Database Recording
Check `card_issuance_fees` table:
```sql
SELECT * FROM card_issuance_fees 
WHERE card_type IN ('disposable', 'virtual', 'physical')
ORDER BY created_at DESC
LIMIT 10;
```

## Common Issues & Solutions

### Issue: Card design not showing
- **Solution**: Check if CardIssuanceModal is reaching 'currency_select' step
- Verify Wallet import in CardIssuanceModal

### Issue: Virtual card controls not appearing
- **Solution**: Verify card type selection went to Virtual (not Disposable)
- Check that spending_controls step is being rendered

### Issue: Fee not matching expected amount
- **Solution**: Verify backend getLiveCardFee() is being called
- Check Nuvion API response or fallback fees
- Formula: Nuvion Fee + (Nuvion Fee × 15%) = Total Fee

### Issue: Mobile responsiveness issues
- **Solution**: Check container max-width (390px)
- Verify no overflow on grid layouts
- Test with viewport at 320px, 390px, 800px

## Performance Notes
- Card design preview: SVG-based, minimal impact
- Spending controls: Optional form inputs, lightweight
- Network requests: Single POST to /api/mobile/cards/issue
- No additional polling or WebSocket needed

## Success Criteria
- ✅ All three card types can be selected
- ✅ Card design preview displays correctly
- ✅ Spending controls appear for virtual cards only
- ✅ Currency selector works with all 9 currencies
- ✅ Fee calculation is accurate
- ✅ Balance validation prevents over-spending
- ✅ Mobile responsive on 320px-800px+
- ✅ Error handling with user-friendly messages
- ✅ Success screen shows card details
- ✅ Build completes without TypeScript errors

---

**Status**: Ready for testing  
**Last Updated**: July 28, 2026
