# PayIT Card Issuance - Visual Reference Guide

## 🎨 Dashboard Screen

### Current State (Before)
```
┌─────────────────────────────────────────────┐
│ Good morning, Igboze ✓                  🔔 │
├─────────────────────────────────────────────┤
│                                             │
│  ╔═════════════════════════════════════╗   │
│  ║  🇳🇬 NGN Balance      👁️  🔀        ║   │
│  ║                                     ║   │
│  ║  ₦ 100,000.00                      ║   │
│  ║  ≈ $250.00 · tap to switch         ║   │
│  ║                                     ║   │
│  ║  ─────────────────────────────────  ║   │
│  ║  [💳] •••• 4821   Manage Card →   ║   │
│  ╚═════════════════════════════════════╝   │
│                                             │
│  Quick Actions (5 buttons)                  │
│  [+Add] [↑Send] [✂] [💳] [💰]            │
│                                             │
│  💡 Grow Your Money                         │
│     [Turn On Savings]                       │
│                                             │
│  Receive Money                              │
│  ┌─ Bank Account ──────────────────────┐   │
│  │ 0123456789 · GTB                    │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  Recent Activity                            │
│  [Transaction list...]                     │
│                                             │
└─────────────────────────────────────────────┘
```

### Updated State (After) ✅
```
┌─────────────────────────────────────────────┐
│ Good morning, Igboze ✓                  🔔 │
├─────────────────────────────────────────────┤
│                                             │
│  ╔═════════════════════════════════════╗   │
│  ║  🇳🇬 NGN Balance      👁️  🔀        ║   │
│  ║                                     ║   │
│  ║  ₦ 100,000.00                      ║   │
│  ║  ≈ $250.00 · tap to switch         ║   │
│  ║                                     ║   │
│  ║  ─────────────────────────────────  ║   │
│  ║  [💳] •••• 4821  [Issue card→]    ║   │ ← NEW!
│  ║           (EML green button)        ║   │
│  ╚═════════════════════════════════════╝   │
│                                             │
│  Quick Actions (5 buttons)                  │
│  [+Add] [↑Send] [✂] [💳] [💰]            │
│                                             │
│  💡 Grow Your Money                         │
│     [Turn On Savings]                       │
│                                             │
│  Receive Money                              │
│  ┌─ Bank Account ──────────────────────┐   │
│  │ 0123456789 · GTB                    │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  Recent Activity                            │
│  [Transaction list...]                     │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 🏢 Business Screen

### Current State (Before)
```
┌─────────────────────────────────────────────┐
│ [👨‍💼] Business Name    [Verified] |  Personal│
├─────────────────────────────────────────────┤
│                                             │
│  ╔═════════════════════════════════════╗   │
│  ║  Business balance                   ║   │
│  ║                                     ║   │
│  ║  $ 5,000.00 USD                    ║   │
│  ║  ≈ ₦2,000,000 NGN                  ║   │
│  ║                                     ║   │
│  ║  ─────────────────────────────────  ║   │
│  ║  [📄Invoice] [💰Payroll]           ║   │
│  ║     (white buttons)                 ║   │
│  ╚═════════════════════════════════════╝   │
│                                             │
│  Receive Money                              │
│  [Bank] [Crypto] [NGN ▼]                   │
│  ┌─ GTB Account ───────────────────────┐   │
│  │ 1234567890 · GTB                    │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  Management                                 │
│  [📄] Invoices         3 pending        →  │
│  [👥] Customers               5         →  │
│  [📊] Overview                          →  │
│                                             │
└─────────────────────────────────────────────┘
```

### Updated State (After) ✅
```
┌─────────────────────────────────────────────┐
│ [👨‍💼] Business Name    [Verified] |  Personal│
├─────────────────────────────────────────────┤
│                                             │
│  ╔═════════════════════════════════════╗   │
│  ║  Business balance                   ║   │
│  ║                                     ║   │
│  ║  $ 5,000.00 USD                    ║   │
│  ║  ≈ ₦2,000,000 NGN                  ║   │
│  ║                                     ║   │
│  ║  ─────────────────────────────────  ║   │
│  ║  [📄Invoice] [💳Issue Card] [💰Pay] ║   │ ← NEW!
│  ║      (white) (EML green) (white)    ║   │
│  ╚═════════════════════════════════════╝   │
│                                             │
│  Receive Money                              │
│  [Bank] [Crypto] [NGN ▼]                   │
│  ┌─ GTB Account ───────────────────────┐   │
│  │ 1234567890 · GTB                    │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  Management                                 │
│  [📄] Invoices         3 pending        →  │
│  [👥] Customers               5         →  │
│  [📊] Overview                          →  │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 🎭 Modal Flow Visualization

### Step 1: Currency Selection
```
╔═════════════════════════════════════════╗
║  Issue a Virtual Card              [×] ║
╠═════════════════════════════════════════╣
║                                         ║
║  Select card type and currency:        ║
║                                         ║
║  ┌──────────────────────────────────┐  ║
║  │ 🇺🇸 Visa (USD)              [✓] │  ║ ← Selected
║  └──────────────────────────────────┘  ║
║                                         ║
║  ┌──────────────────────────────────┐  ║
║  │ 🇪🇺 Mastercard (EUR)             │  ║
║  └──────────────────────────────────┘  ║
║                                         ║
║  ┌──────────────────────────────────┐  ║
║  │ 🇬🇧 Visa (GBP)                  │  ║
║  └──────────────────────────────────┘  ║
║                                         ║
║  ┌──────────────────────────────────┐  ║
║  │ 🇳🇬 Mastercard (NGN)             │  ║
║  └──────────────────────────────────┘  ║
║                                         ║
║  ┌──────────────────────────────────┐  ║
║  │ 🇰🇪 Visa (KES)                  │  ║
║  └──────────────────────────────────┘  ║
║                                         ║
║  ╔════ FEE INFO ════════════════════╗  ║
║  ║ Fee to be charged:               ║  ║
║  ║ $2.88                        ← ║  ║ TOTAL ONLY!
║  ╚══════════════════════════════════╝  ║
║                                         ║
║  ╔════ BALANCE ═════════════════════╗  ║
║  ║ Current: $100.00 USDT            ║  ║
║  ╚══════════════════════════════════╝  ║
║                                         ║
║              [Cancel]  [Continue →]    ║
║                               (green)   ║
║                                         ║
╚═════════════════════════════════════════╝
```

### Step 2: Fee Confirmation
```
╔═════════════════════════════════════════╗
║  Confirm Card Issuance            [×] ║
╠═════════════════════════════════════════╣
║                                         ║
║  ╔════ DETAILS ═════════════════════╗  ║
║  ║ Card Type:  Visa (USD)           ║  ║
║  ║                                  ║  ║
║  ║ Your Balance: $100.00 USDT       ║  ║
║  ║                                  ║  ║
║  ║ Fee to be charged: $2.88     [✓] ║  ║
║  ║                                  ║  ║
║  ║ Balance After: $97.12 USDT       ║  ║
║  ╚══════════════════════════════════╝  ║
║                                         ║
║  By clicking "Confirm", PayIT will     ║
║  deduct $2.88 from your balance and     ║
║  issue a virtual card.                 ║
║                                         ║
║              [Back]  [Confirm →]       ║
║                           (green)       ║
║                                         ║
╚═════════════════════════════════════════╝
```

### Step 3: Success
```
╔═════════════════════════════════════════╗
║  Card Issued Successfully!        [×] ║
╠═════════════════════════════════════════╣
║                                         ║
║              ╔═══════╗                 ║
║              ║   ✓   ║                 ║
║              ╚═══════╝                 ║
║                                         ║
║  ╔════ DETAILS ═════════════════════╗  ║
║  ║ Card ID:     card_abc123xyz      ║  ║
║  ║                                  ║  ║
║  ║ Last 4 Digits:    4821           ║  ║
║  ║                                  ║  ║
║  ║ Fee Charged:      $2.88          ║  ║
║  ║                                  ║  ║
║  ║ New Balance:   $97.12 USDT   [✓] ║  ║
║  ╚══════════════════════════════════╝  ║
║                                         ║
║  Card issued successfully. Fee: $2.88  ║
║  deducted from your USDT balance.      ║
║                                         ║
║              [Done ✓]                   ║
║                                         ║
║  (Auto-closes in 3 seconds)            ║
║                                         ║
╚═════════════════════════════════════════╝
```

---

## ❌ Error States

### Insufficient Balance Error
```
╔═════════════════════════════════════════╗
║  Issue a Virtual Card              [×] ║
╠═════════════════════════════════════════╣
║                                         ║
║  Select card type and currency:        ║
║                                         ║
║  ┌──────────────────────────────────┐  ║
║  │ 🇺🇸 Visa (USD)              [✓] │  ║
║  └──────────────────────────────────┘  ║
║                                         ║
║  ╔════ FEE INFO ════════════════════╗  ║
║  ║ Fee to be charged:               ║  ║
║  ║ $2.88                            ║  ║
║  ╚══════════════════════════════════╝  ║
║                                         ║
║  ╔════════════════════════════════╗   ║
║  ║ ⚠️  Insufficient Balance         ║   ║
║  ║                                 ║   ║
║  ║ You need $2.88 USDT but have   ║   ║
║  ║ only $1.00                     ║   ║
║  ╚════════════════════════════════╝   ║
║                                         ║
║              [Cancel]  [Continue ✗]    ║
║                           (disabled)    ║
║                                         ║
╚═════════════════════════════════════════╝
```

### API Error
```
╔═════════════════════════════════════════╗
║  Something went wrong             [×] ║
╠═════════════════════════════════════════╣
║                                         ║
║  ╔════════════════════════════════╗   ║
║  ║ ⚠️  Error                       ║   ║
║  ║                                 ║   ║
║  ║ Failed to issue card. Please    ║   ║
║  ║ try again or contact support.  ║   ║
║  ╚════════════════════════════════╝   ║
║                                         ║
║              [Close]  [Try Again]      ║
║                                         ║
╚═════════════════════════════════════════╝
```

---

## 🎨 Color Reference

### Button States
```
DEFAULT (Enabled):
└─ Background: FOREST (#047857) or EML (#5EEAB0)
└─ Text: WHITE (#FFFFFF)
└─ Border: None

HOVER (Enabled):
└─ Background: Darker shade
└─ Text: WHITE (#FFFFFF)

DISABLED:
└─ Background: MIST (#E5E7EB)
└─ Text: SLATE (#64748B)
└─ Cursor: not-allowed

OUTLINE:
└─ Background: WHITE (#FFFFFF)
└─ Border: MIST (#E5E7EB), 1px
└─ Text: INK (#0F172A)
```

### Alert States
```
SUCCESS (Green):
└─ Background: MINT (#ECFDF5)
└─ Border: EMERALD (#10B981)
└─ Icon: EMERALD (#10B981)
└─ Text: FOREST (#047857)

ERROR (Red):
└─ Background: #FEE2E2
└─ Border: #DC2626
└─ Icon: #DC2626
└─ Text: #7F1D1D

INFO (Blue):
└─ Background: #EFF6FF
└─ Border: #0284C7
└─ Icon: #0284C7
└─ Text: #1E3A8A
```

---

## 📐 Spacing Reference

```
Modal:
└─ Padding: 24px (6 × 4px)
└─ Gap between sections: 16px (4 × 4px)
└─ Gap between form fields: 12px (3 × 4px)

Buttons:
└─ Padding: 12px horizontal, 10px vertical
└─ Gap between buttons: 12px (3 × 4px)
└─ Min height: 44px (touch friendly)

Cards:
└─ Padding: 16px (4 × 4px)
└─ Border radius: 12px
└─ Box shadow: 0 4px 6px rgba(0,0,0,0.07)

Text:
└─ Section header: 16.5px, bold
└─ Body text: 14px, regular
└─ Small text: 12px, regular
└─ Help text: 10.5px, regular
```

---

## 📱 Responsive Breakpoints

```
Mobile (320px - 480px):
└─ Modal: Full width - 16px padding
└─ Buttons: Full width stacked
└─ Font size: Base (no adjustment)

Tablet (481px - 768px):
└─ Modal: max-w-sm (448px)
└─ Buttons: Inline (2 per row)
└─ Spacing: Slightly increased

Desktop (769px+):
└─ Modal: max-w-sm (448px), centered
└─ Buttons: Inline (side by side)
└─ Full spacing
```

---

## ✨ Animation Timing

```
Modal Open:
└─ Duration: 200ms
└─ Easing: ease-out

Modal Close:
└─ Duration: 150ms
└─ Easing: ease-in

Button Hover:
└─ Duration: 100ms
└─ Easing: ease-out

Success Auto-close:
└─ Delay: 3000ms (3 seconds)
└─ Duration: 300ms (fade out)
```

---

## 🎯 Key Visual Differences

| Element | Location | Change | Color |
|---------|----------|--------|-------|
| Issue card button | Dashboard | NEW button | EML (#5EEAB0) |
| Issue Card button | Business | NEW button | EML (#5EEAB0) |
| Modal | Full screen | NEW component | White bg |
| Fee display | Modal step 1 | Single total | INK text |
| Success icon | Modal step 3 | Checkmark | EMERALD |

---

## 👁️ Visual Checklist

When testing, verify:
- [x] Button text is readable (black on green background)
- [x] Modal opens smoothly without glitches
- [x] All text is properly aligned
- [x] Icons display correctly
- [x] Colors match design tokens
- [x] Spacing looks balanced
- [x] Buttons are touch-friendly (44px+)
- [x] Error messages stand out visually
- [x] Success state is celebratory
- [x] Modal closes cleanly

---

**Visual Design Status: PRODUCTION READY** ✅🎨
