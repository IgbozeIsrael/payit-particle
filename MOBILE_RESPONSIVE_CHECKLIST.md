# Mobile Responsiveness Checklist - Quick Reference

**For:** All PayIT developers  
**Purpose:** Ensure every new screen fits perfectly on mobile phones  
**Last Updated:** July 28, 2026  

---

## 🚀 Quick Start - Copy This Template

```typescript
// Template for new screens
import React, { useState } from 'react';

export default function NewScreen() {
  const [state, setState] = useState(null);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      minHeight: "100%",
      gap: "12px",
      padding: "16px"
    }}>
      {/* Content goes here */}
      
      {/* All content automatically scrolls vertically */}
      {/* Navbar at bottom stays fixed */}
    </div>
  );
}
```

---

## ✅ Pre-Launch Checklist for Every New Screen

### Container Setup
- [ ] Screen is functional component
- [ ] Uses flex layout or natural flow
- [ ] Padding: `padding: "12px"` or `px-3`
- [ ] Min-height: `minHeight: "100%"` (fills available space)
- [ ] No fixed width (width: auto or 100%)
- [ ] No horizontal margins (stays centered in 390px container)

### Content Layout
- [ ] Content flows vertically (flex-column or natural block)
- [ ] No horizontal scrolling possible
- [ ] Gap between elements: 8-12px (gap-2 or gap-3)
- [ ] Responsive grid (max 3 columns for mobile)
- [ ] Lists scroll vertically (OK - no horizontal)
- [ ] Buttons full width or flex with consistent gaps

### Typography
- [ ] Heading size: 20-24px (text-xl or text-2xl)
- [ ] Body text: 14px (text-sm)
- [ ] Labels: 12px (text-xs)
- [ ] Line height: 1.5 (readable)
- [ ] No text overflow on 320px phone
- [ ] All text readable without zoom

### Buttons & Touch Targets
- [ ] Minimum height: 44px (button-like elements)
- [ ] Minimum width: 44px (for icons)
- [ ] Padding: at least 12px around content
- [ ] Gap between buttons: 8px (not cramped)
- [ ] Full-width buttons when space-filling: `className="w-full"`
- [ ] Icon buttons centered with padding

### Forms & Inputs
- [ ] Input fields: 100% width or full-width wrapper
- [ ] Labels above or inside fields
- [ ] Padding: 12px inside fields
- [ ] Error messages visible below fields
- [ ] Submit button: full width if primary action
- [ ] No side-by-side fields (stack vertically)

### Lists & Scrollable Content
- [ ] List items: at least 16px height with padding
- [ ] Item padding: 12px horizontal, 8px vertical
- [ ] Dividers: 1px, light gray
- [ ] Touch targets for list items: 48px+ recommended
- [ ] Empty state centered with emoji/icon
- [ ] Loading state centered with spinner

### Cards & Containers
- [ ] Card padding: 16px (px-4)
- [ ] Card border radius: 12-16px (rounded-lg or rounded-xl)
- [ ] Card shadow: subtle (shadow-sm or shadow)
- [ ] Background color: white or light
- [ ] Card width: 100% of container
- [ ] No overflow on sides

### Modals & Dialogs
- [ ] Modal width: full width with padding, OR max-w-sm centered
- [ ] Modal height: max 85vh (leaves space for keyboard)
- [ ] Modal has close button (top-right or bottom)
- [ ] Content scrolls if exceeds height
- [ ] Overlay: semi-transparent
- [ ] Bottom sheet style (better UX on mobile)

### Images & Media
- [ ] Images: max-width 100% (responsive)
- [ ] Aspect ratio preserved (use aspect-video, etc.)
- [ ] No fixed height (height: auto)
- [ ] Images never cause horizontal scroll
- [ ] Placeholder visible while loading
- [ ] Error state if image fails

### Navigation & Tabs
- [ ] Tabs: full width, even spacing
- [ ] Tab height: 44px+ for touch
- [ ] Tab gap: 0 (full width) or equal flex
- [ ] Underline/indicator clearly visible
- [ ] Active tab color: distinct (green)
- [ ] No tabs overflow horizontally

### Spacing & Padding
- [ ] Screen padding: 12-16px (px-3 to px-4)
- [ ] Section gap: 12px (mb-3) or 16px (mb-4)
- [ ] Element gap: 4-8px (mb-1 to mb-2)
- [ ] Use Tailwind spacing (mb, mt, gap, px, py)
- [ ] 4px grid system throughout
- [ ] No arbitrary pixel values

### Mobile-Only Considerations
- [ ] Safe area respected (notch area)
- [ ] Status bar doesn't cover content
- [ ] Keyboard pushes content up (auto in browsers)
- [ ] Landscape mode tested (mobile views 360px wide)
- [ ] Zoom level: 100% (doesn't need zoom)
- [ ] Double-tap zoom: disabled for forms (optional)

---

## 🚫 Common Mistakes to Avoid

### ❌ Don't Do This
```typescript
// Bad: Fixed width
<div style={{ width: "500px" }}>  ❌

// Bad: No padding
<div style={{ padding: "0" }}>  ❌

// Bad: Side-by-side form fields
<div style={{ display: "flex" }}>
  <input />
  <input />
</div>  ❌

// Bad: Horizontal scroll possible
<div style={{ display: "flex", gap: "20px", minWidth: "500px" }}>  ❌

// Bad: Small touch targets
<button style={{ padding: "4px" }}>  ❌

// Bad: Text overflow
<p style={{ maxWidth: "none", whiteSpace: "nowrap" }}>  ❌
```

### ✅ Do This Instead
```typescript
// Good: Responsive width
<div style={{ width: "100%", maxWidth: "390px" }}>  ✅

// Good: Consistent padding
<div style={{ padding: "16px" }}>  ✅

// Good: Stacked form fields
<div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
  <input />
  <input />
</div>  ✅

// Good: Vertical scroll
<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>  ✅

// Good: Touch-friendly targets
<button style={{ padding: "12px", minHeight: "44px" }}>  ✅

// Good: Text wraps naturally
<p style={{ wordWrap: "break-word" }}>  ✅
```

---

## 📱 Device Size Reference

### Keep These Numbers in Mind

```
Minimum phone width:    320px (iPhone SE 1st gen)
Target phone width:     390px (iPhone 13/14/15)
Maximum phone width:    428px (iPhone 14 Plus)

Container max-width:    390px (PayIT app)
Safe padding:           12-16px on sides
Usable content width:   358px minimum (390 - 32px padding)

Always ensure content fits in 358px width!
```

---

## 🎨 Responsive Grid System

### Tailwind Grid Usage

#### Single Column (Recommended for Mobile)
```jsx
<div className="flex flex-col gap-2">
  <Item />
  <Item />
  <Item />
</div>
```

#### 2-Column Grid (Use with caution)
```jsx
<div className="grid grid-cols-2 gap-2">
  <Item />
  <Item />
  <Item />
  <Item />
</div>
```
**Only if items are small (< 160px each)**

#### 3-Column Grid (For small items)
```jsx
<div className="grid grid-cols-3 gap-2">
  <Item />  {/* Each ~110px */}
  <Item />
  <Item />
</div>
```
**Only for currency buttons, icons, etc.**

#### Button Group (Full Width)
```jsx
<div className="flex gap-2">
  <button className="flex-1">Button</button>
  <button className="flex-1">Button</button>
</div>
```
**Equal width buttons**

---

## 🔧 Responsive TypeScript Component Template

```typescript
import React, { useState } from 'react';
import { ChevronLeft } from 'lucide-react';

interface ScreenProps {
  // Define props if needed
}

export default function MyScreen({}: ScreenProps) {
  const [state, setState] = useState(null);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        padding: "16px",
        gap: "12px",
        background: "#F7FAF8",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          onClick={() => window.history.back()}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "44px",
            height: "44px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <ChevronLeft size={24} color="#0F172A" />
        </button>
        <h1 style={{ fontSize: "20px", fontWeight: "bold", margin: 0 }}>
          Screen Title
        </h1>
      </div>

      {/* Content - Scrolls vertically */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Your content here */}
      </div>

      {/* Action Button - Full Width */}
      <button
        style={{
          width: "100%",
          padding: "12px",
          background: "#047857",
          color: "white",
          border: "none",
          borderRadius: "12px",
          fontSize: "14px",
          fontWeight: "600",
          cursor: "pointer",
          minHeight: "48px",
          marginTop: "auto",
        }}
      >
        Action
      </button>
    </div>
  );
}
```

---

## 📋 Quality Assurance Checklist

Before submitting any screen:

### Layout Quality
- [ ] Screen loads without error
- [ ] No horizontal scroll on 320px phone
- [ ] No vertical scroll on 390px phone (unless needed)
- [ ] Content fits in landscape mode (360px wide)
- [ ] Bottom navbar always visible
- [ ] No content hidden by navbar

### Visual Quality
- [ ] Colors match design system
- [ ] Typography consistent
- [ ] Spacing uniform (4px grid)
- [ ] Icons properly sized (16-24px)
- [ ] Images responsive
- [ ] No text overflow or cropping

### Functional Quality
- [ ] All buttons clickable (44px+ target)
- [ ] Forms work (inputs focus, keyboard shows)
- [ ] Links navigate correctly
- [ ] Modals close properly
- [ ] Loading states show
- [ ] Error states handled

### Accessibility
- [ ] Text has sufficient contrast (4.5:1+)
- [ ] Font size readable (14px+)
- [ ] Touch targets accessible (44px+)
- [ ] Screen reader compatible
- [ ] Keyboard navigation works

---

## 🚀 Performance Tips for Mobile

### Code Splitting
```typescript
// Import screen lazily
const MyScreen = lazy(() => import('./screens/MyScreen'));
```

### Image Optimization
```jsx
<img
  src="image.jpg"
  alt="Description"
  style={{
    maxWidth: "100%",
    height: "auto",
    display: "block"
  }}
/>
```

### Prevent Layout Shift
```jsx
<div style={{
  aspectRatio: "16/9",
  background: "#F0F0F0"
}}>
  {/* Image loads here without layout shift */}
</div>
```

---

## ✅ Final Verification

Before deploying any screen:

```
Browser DevTools Test:
□ iPhone SE (320px)      - Fits perfectly
□ iPhone 13 (390px)      - Fits perfectly
□ iPhone Plus (428px)    - Centered, perfect
□ Landscape (360px)      - Fits perfectly
□ No horizontal scroll   - Never

Real Device Test (if possible):
□ Test on real iPhone
□ Test on real Android
□ Verify no overflow
□ Check touch targets
```

---

## 🎯 Summary

### Every New Screen Must Have:
✅ Responsive layout (flex, no fixed widths)
✅ Proper padding (12-16px sides)
✅ Vertical scrolling only (no horizontal)
✅ Touch-friendly targets (44px+)
✅ Readable typography (14px+)
✅ Consistent spacing (4px grid)
✅ Mobile-first approach
✅ No overflow issues

### PayIT App Guarantees:
✅ 390px max-width container
✅ Centered on larger screens
✅ No horizontal scroll ever
✅ All screens tested and working
✅ Production ready

---

## 📞 Questions?

If a screen doesn't fit:
1. Check if content width > 358px (390 - 32 padding)
2. Remove fixed widths (use %, flex, or auto)
3. Check for horizontal scroll causes
4. Test on real mobile device
5. Review this checklist again

**Remember:** The app container handles all responsive design. Your job is to make content fit within 358px usable width!

---

**Status: ✅ ALL SCREENS RESPONSIVE**

Every PayIT screen is perfectly optimized for mobile phones from 320px to 800px+.

Happy developing! 📱✨
