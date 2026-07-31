# Bugfix Requirements: PayIT Virtual Card Issuance with Platform Fee Integration

## Introduction

The virtual card issuance flow in PayIT is broken across three critical areas: (1) the backend API doesn't charge platform fees upon card issuance and fails to deduct from user USDT balance, (2) the frontend Cards.tsx component lacks a fee confirmation modal showing the total fee charged, and (3) the database schema is missing the card_issuance_fees table required to track per-card fees. These defects prevent successful card issuance with integrated fee collection, making the card feature non-functional for monetization and user trust.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user calls POST /api/mobile/cards/issue THEN the system does NOT calculate fees (platform_fee = nuvion_fee × 0.15), does NOT add them to nuvion_fee to get total_fee, and returns card details WITHOUT fee information

1.2 WHEN a user calls POST /api/mobile/cards/issue THEN the system does NOT deduct the calculated total_fee from the user's USDT balance in the hd_deposits ledger

1.3 WHEN a user calls POST /api/mobile/cards/issue THEN the system does NOT return fee information in the API response, including total_fee, nuvion_fee amount, or the new balance after fee deduction

1.4 WHEN a user calls POST /api/mobile/cards/issue with a nuvion_fee that requires platform_fee calculation THEN the system does NOT return TOTAL FEE ONLY (not a breakdown of nuvion_fee + platform_fee separately)

1.5 WHEN a user issues a card THEN the system does NOT record the fee transaction in the card_issuance_fees table (or analogous fee tracking structure) linking the card to its associated fee

1.6 WHEN a frontend user clicks Issue Card in Cards.tsx THEN the system does NOT display a fee confirmation modal showing the TOTAL FEE to be charged before card issuance completes

1.7 WHEN a user issues a personal or business card THEN the system does NOT respect the context separation - personal cards are not linked exclusively to personal profile_id and business cards are not linked exclusively to business profile_id in the cards table

1.8 WHEN a card is issued with fee deduction THEN the system does NOT send fees to the configured fee wallet address (0x09648d98196460D63B3dB1B90c60100756dECb77) or log this transaction for audit purposes

### Expected Behavior (Correct)

2.1 WHEN a user calls POST /api/mobile/cards/issue THEN the system SHALL calculate nuvion_fee from Nuvion API response, derive platform_fee = nuvion_fee × 0.15, compute total_fee = nuvion_fee + platform_fee, and include all values in the response

2.2 WHEN a user calls POST /api/mobile/cards/issue THEN the system SHALL immediately deduct the calculated total_fee from the user's USDT balance by creating an hd_deposits entry with negative amount (-total_fee)

2.3 WHEN a user calls POST /api/mobile/cards/issue THEN the system SHALL return card details in response INCLUDING { card_id, nuvion_fee, platform_fee, total_fee, new_balance, success_message }

2.4 WHEN calculating and returning fees in POST /api/mobile/cards/issue THEN the system SHALL return TOTAL FEE ONLY (single number) not a breakdown showing nuvion_fee and platform_fee separately

2.5 WHEN a user issues a card with an associated fee THEN the system SHALL insert a record into card_issuance_fees table with { card_id, profile_id, nuvion_fee, platform_fee, total_fee, user_id, timestamp }

2.6 WHEN a frontend user clicks Issue Card button THEN the system SHALL display a fee confirmation modal showing "TOTAL FEE: $X.XX" (derived from backend response) with Accept/Cancel buttons before final card issuance

2.7 WHEN a user issues a card while active_context = 'personal' THEN the system SHALL store the card with the personal profile_id; WHEN active_context = 'business' THEN the system SHALL store the card with the business profile_id, ensuring no cross-context card visibility

2.8 WHEN a card is issued and fees are deducted THEN the system SHALL record the fee transaction to the configured fee wallet address (0x09648d98196460D63B3dB1B90c60100756dECb77) and create an audit log entry with { card_id, fee_amount, recipient_address, timestamp }

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user issues a card with ALL supported Nuvion card types (per Nuvion API capabilities) THEN the system SHALL CONTINUE TO preserve all existing card type support and return the same card details structure as before

3.2 WHEN a user's balance is queried with GET /api/mobile/balance THEN the system SHALL CONTINUE TO return the balance correctly after card fees have been deducted (new_balance should reflect the deduction)

3.3 WHEN a personal profile user issues a card and a business profile user issues a card THEN the system SHALL CONTINUE TO keep the two card lists separate when queried by context via GET /api/mobile/cards

3.4 WHEN a user views transaction history THEN the system SHALL CONTINUE TO show card issuance fee deductions as separate transactions with clear labeling (e.g., "Card Issuance Fee")

3.5 WHEN the Nuvion API returns a response for card issuance THEN the system SHALL CONTINUE TO create a buffer sub-account and store card metadata in the cards table as it does currently
