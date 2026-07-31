const Groq = require('groq-sdk');

// Reuse Groq client
let _groq = null;
function getGroqClient() {
  if (!_groq) {
    const apiKey = process.env.GROQ_API_KEY;
    if (apiKey && apiKey !== 'YOUR_GROQ_API_KEY' && !apiKey.startsWith('mock_')) {
      _groq = new Groq({ apiKey });
    }
  }
  return _groq;
}

/**
 * Local heuristic parser fallback aligned with Section 10.1 JSON Schema.
 */
function parseHeuristic(text) {
  const clean = text.toLowerCase().trim();

  // Pattern 1: P2P_TRANSFER (e.g., "send 5000 NGN to Maria", "pay 20 USDC to Bob")
  const transferRegex = /(?:send|pay|transfer)\s+([\d,.]+)\s*(usdc|eurc|ngn|₦|\$|usdt0)?\s+(?:to|for)\s+([a-zA-Z0-9_]+)/i;
  let match = clean.match(transferRegex);
  if (match) {
    const amount = parseFloat(match[1].replace(/,/g, ''));
    let currency = (match[2] || 'USDC').toUpperCase();
    if (currency === '₦') currency = 'NGN';
    if (currency === '$') currency = 'USDC';
    if (currency === 'USDT0') currency = 'USDC';
    const recipient = match[3];

    return {
      action: 'P2P_TRANSFER',
      confidence: 0.95,
      languageDetected: 'English/Pidgin',
      parameters: {
        amount,
        currency,
        recipientIdentifier: recipient,
        bankName: null,
        accountNumber: null,
        memo: null
      }
    };
  }

  // Pattern 2: CASH_OUT (e.g., "cash out 10000 NGN to GTBank account 0123456789")
  const cashoutRegex = /(?:cash\s*out|withdraw|transfer\s+to\s+bank)\s+([\d,.]+)\s*(usdc|eurc|ngn|₦|\$)?\s+(?:to\s+)?([a-zA-Z0-9\s]+?)\s+(?:account|no\.?)?\s*(\d{10})/i;
  match = clean.match(cashoutRegex);
  if (match) {
    const amount = parseFloat(match[1].replace(/,/g, ''));
    let currency = (match[2] || 'NGN').toUpperCase();
    if (currency === '₦') currency = 'NGN';
    if (currency === '$') currency = 'USDC';
    const bankName = match[3].trim();
    const accountNumber = match[4];

    return {
      action: 'CASH_OUT',
      confidence: 0.95,
      languageDetected: 'English/Pidgin',
      parameters: {
        amount,
        currency,
        recipientIdentifier: null,
        bankName,
        accountNumber,
        memo: 'Cash-out payout'
      }
    };
  }

  // Pattern 3: INVOICE_CREATION (e.g., "invoice Bob 20 USDC")
  const invoiceRegex1 = /(?:invoice|bill)\s+(?!for\b)(?!to\b)([a-zA-Z0-9_]+)\s+([\d,.]+)\s*(usdc|eurc|ngn|₦|\$)?/i;
  match = clean.match(invoiceRegex1);
  if (match) {
    const recipient = match[1];
    const amount = parseFloat(match[2].replace(/,/g, ''));
    let currency = (match[3] || 'USDC').toUpperCase();
    if (currency === '₦') currency = 'NGN';
    if (currency === '$') currency = 'USDC';

    return {
      action: 'INVOICE_CREATION',
      confidence: 0.95,
      languageDetected: 'English',
      parameters: {
        amount,
        currency,
        recipientIdentifier: recipient,
        bankName: null,
        accountNumber: null,
        memo: null,
        durationDays: null,
        saveType: null,
        autoSavePercent: null,
        recipients: null
      }
    };
  }

  const invoiceRegex2 = /(?:create\s+invoice|new\s+invoice|invoice)\s+(?:for\s+)?([\d,.]+)\s*(usdc|eurc|ngn|₦|\$)?\s+(?:to|for)\s+([a-zA-Z0-9_]+)/i;
  match = clean.match(invoiceRegex2);
  if (match) {
    const amount = parseFloat(match[1].replace(/,/g, ''));
    let currency = (match[2] || 'USDC').toUpperCase();
    if (currency === '₦') currency = 'NGN';
    if (currency === '$') currency = 'USDC';
    const recipient = match[3];

    return {
      action: 'INVOICE_CREATION',
      confidence: 0.95,
      languageDetected: 'English',
      parameters: {
        amount,
        currency,
        recipientIdentifier: recipient,
        bankName: null,
        accountNumber: null,
        memo: null,
        durationDays: null,
        saveType: null,
        autoSavePercent: null,
        recipients: null
      }
    };
  }

  // Pattern 4: SET_AUTOSAVE (e.g., "auto save 15% of every invoice")
  const autosaveRegex = /(?:auto[- ]?save|save)\s+(\d+(?:\.\d+)?)\s*%?\s+(?:of\s+)?(?:every\s+)?invoice/i;
  match = clean.match(autosaveRegex);
  if (match) {
    return {
      action: 'SET_AUTOSAVE',
      confidence: 0.95,
      languageDetected: 'English',
      parameters: {
        amount: null,
        currency: 'USDC',
        recipientIdentifier: null,
        bankName: null,
        accountNumber: null,
        memo: null,
        autoSavePercent: parseFloat(match[1]),
        saveType: clean.includes('yield') ? 'yield' : 'lock',
        durationDays: 30,
        recipients: null
      }
    };
  }

  // Pattern 5: SAVINGS (e.g., "save 500 USDC for 90 days with yield")
  const savingsRegex = /(?:save|lock)\s+([\d,.]+)\s*(usdc|eurc|ngn|₦|\$)?\s+(?:for\s+)?(\d+)\s*(day|days|week|weeks|month|months|year|years)(?:\s+with\s+(?:yield|interest))?/i;
  match = clean.match(savingsRegex);
  if (match) {
    let durationDays = parseInt(match[3], 10);
    const unit = match[4];
    if (unit.startsWith('week')) durationDays *= 7;
    if (unit.startsWith('month')) durationDays *= 30;
    if (unit.startsWith('year')) durationDays *= 365;

    const withYield = clean.includes('yield') || clean.includes('interest') || clean.includes('earn');
    return {
      action: withYield ? 'SAVINGS_YIELD' : 'SAVINGS_LOCK',
      confidence: 0.95,
      languageDetected: 'English',
      parameters: {
        amount: parseFloat(match[1].replace(/,/g, '')),
        currency: (match[2] || 'USDC').toUpperCase().replace('₦', 'NGN').replace('$', 'USDC'),
        recipientIdentifier: null,
        bankName: null,
        accountNumber: null,
        memo: null,
        durationDays,
        saveType: withYield ? 'yield' : 'lock',
        autoSavePercent: null,
        recipients: null
      }
    };
  }

  // Pattern 6: BULK_PAYROLL (e.g., "pay staff Ada 500 USDC, John 300 USDC")
  if (/(?:pay\s+staff|payroll|salary)/i.test(clean)) {
    const rowRegex = /([a-zA-Z][a-zA-Z0-9_\s]{1,30}?)\s+([\d,.]+)\s*(usdc|eurc|ngn)/gi;
    const recipients = [];
    let payrollMatch;
    while ((payrollMatch = rowRegex.exec(text)) !== null) {
      recipients.push({
        name: payrollMatch[1].trim(),
        amount: parseFloat(payrollMatch[2].replace(/,/g, '')),
        currency: payrollMatch[3].toUpperCase(),
        destination: null,
        paymentMethod: payrollMatch[3].toUpperCase() === 'NGN' ? 'fiat' : 'stablecoin'
      });
    }
    if (recipients.length > 0) {
      return {
        action: 'BULK_PAYROLL',
        confidence: 0.9,
        languageDetected: 'English',
        parameters: {
          amount: null,
          currency: recipients[0].currency,
          recipientIdentifier: null,
          bankName: null,
          accountNumber: null,
          memo: null,
          durationDays: null,
          saveType: null,
          autoSavePercent: null,
          recipients
        }
      };
    }
  }

  if (clean === 'help' || clean === '/help') {
    return {
      action: 'help',
      confidence: 1.0,
      languageDetected: 'English',
      parameters: {
        amount: null,
        currency: null,
        recipientIdentifier: null,
        bankName: null,
        accountNumber: null,
        memo: null
      }
    };
  }

  if (clean === 'balance' || clean === 'check balance') {
    return {
      action: 'balance',
      confidence: 1.0,
      languageDetected: 'English',
      parameters: {
        amount: null,
        currency: null,
        recipientIdentifier: null,
        bankName: null,
        accountNumber: null,
        memo: null
      }
    };
  }

  // Simple trigger for step-by-step invoice flow
  if (clean === 'invoice' || clean === 'new invoice' || clean === 'create invoice') {
    return {
      action: 'INVOICE_CREATION',
      confidence: 1.0,
      languageDetected: 'English',
      parameters: {
        amount: null,
        currency: 'USDC',
        recipientIdentifier: null,
        bankName: null,
        accountNumber: null,
        memo: null
      }
    };
  }

  if (clean === 'customers' || clean === 'customer directory' || clean === '📋 customers') {
    return { action: 'CUSTOMER_DIRECTORY', confidence: 1.0, languageDetected: 'English', parameters: { memo: text } };
  }

  if (clean === 'recurring' || clean === 'recurring invoices' || clean === '📅 recurring') {
    return { action: 'LIST_RECURRING', confidence: 1.0, languageDetected: 'English', parameters: { memo: text } };
  }

  const recurringRegex = /recurring\s+invoice\s+(.+?)\s+([\d,.]+)\s*(usdc|ngn)?\s*(weekly|monthly)?/i;
  match = clean.match(recurringRegex);
  if (match) {
    return {
      action: 'RECURRING_INVOICE',
      confidence: 0.95,
      languageDetected: 'English',
      parameters: {
        recipientIdentifier: match[1].trim(),
        amount: parseFloat(match[2].replace(/,/g, '')),
        currency: (match[3] || 'USDC').toUpperCase(),
        frequency: match[4] || 'monthly',
        memo: text
      }
    };
  }

  if (clean === 'expenses' || clean === 'my expenses' || clean === '🧾 expenses') {
    return { action: 'LIST_EXPENSES', confidence: 1.0, languageDetected: 'English', parameters: { memo: text } };
  }

  if (clean.includes('expense report') || clean.includes('tax report')) {
    return { action: 'EXPENSE_REPORT', confidence: 1.0, languageDetected: 'English', parameters: { memo: text } };
  }

  const expenseRegex = /expense\s+([\d,.]+)\s*(usdc|ngn|eurc)?\s*(.+)?/i;
  match = text.match(expenseRegex);
  if (match) {
    return {
      action: 'EXPENSE_LOG',
      confidence: 0.9,
      languageDetected: 'English',
      parameters: {
        amount: parseFloat(match[1].replace(/,/g, '')),
        currency: (match[2] || 'USDC').toUpperCase(),
        memo: match[3] || null,
        category: 'other'
      }
    };
  }

  if (clean === 'goals' || clean === 'savings goals' || clean === '🎯 goals') {
    return { action: 'LIST_GOALS', confidence: 1.0, languageDetected: 'English', parameters: { memo: text } };
  }

  const goalRegex = /(?:save|goal)\s+([\d,.]+)\s*(ngn|usdc|₦|\$)?\s+(?:for\s+)?(.+?)(?:\s+by\s+(.+))?$/i;
  match = text.match(goalRegex);
  if (match) {
    let currency = (match[2] || 'USDC').toUpperCase();
    if (currency === '₦') currency = 'NGN';
    return {
      action: 'SAVINGS_GOAL',
      confidence: 0.9,
      languageDetected: 'English',
      parameters: {
        targetAmount: parseFloat(match[1].replace(/,/g, '')),
        currency,
        goalTitle: match[3]?.trim(),
        targetDate: match[4]?.trim(),
        memo: text
      }
    };
  }

  if (clean.includes('low balance') || clean.includes('balance alert')) {
    const alertMatch = clean.match(/(\d+(?:\.\d+)?)/);
    return {
      action: 'SET_LOW_BALANCE_ALERT',
      confidence: 0.9,
      languageDetected: 'English',
      parameters: { amount: alertMatch ? parseFloat(alertMatch[1]) : null, memo: text }
    };
  }

  if (clean.startsWith('approve apr_') || clean.startsWith('approve ')) {
    const id = clean.match(/apr_[a-z0-9]+/i)?.[0];
    return { action: 'APPROVE_PAYROLL', confidence: 1.0, languageDetected: 'English', parameters: { approvalId: id, memo: text } };
  }

  if (clean.startsWith('reject apr_') || clean.startsWith('reject ')) {
    const id = clean.match(/apr_[a-z0-9]+/i)?.[0];
    return { action: 'REJECT_PAYROLL', confidence: 1.0, languageDetected: 'English', parameters: { approvalId: id, memo: text } };
  }

  if (clean === 'savings' || clean === 'save money' || clean === '🐷 savings') {
    return {
      action: 'SAVINGS_MENU',
      confidence: 1.0,
      languageDetected: 'English',
      parameters: {
        amount: null,
        currency: 'USDC',
        recipientIdentifier: null,
        bankName: null,
        accountNumber: null,
        memo: null,
        durationDays: null,
        saveType: null,
        autoSavePercent: null,
        recipients: null
      }
    };
  }

  if (clean === 'pay staff' || clean === 'payroll' || clean === '👥 pay staff') {
    return {
      action: 'BULK_PAYROLL',
      confidence: 1.0,
      languageDetected: 'English',
      parameters: {
        amount: null,
        currency: 'USDC',
        recipientIdentifier: null,
        bankName: null,
        accountNumber: null,
        memo: null,
        durationDays: null,
        saveType: null,
        autoSavePercent: null,
        recipients: null
      }
    };
  }

  // Fallback / unrecognized
  return {
    action: 'UNRECOGNIZED_COMMAND',
    confidence: 0.5,
    languageDetected: 'Unknown',
    parameters: {
      amount: null,
      currency: null,
      recipientIdentifier: null,
      bankName: null,
      accountNumber: null,
      memo: text
    }
  };
}

/**
 * Natural language intent parser matching the system prompt and JSON schema.
 */
async function parseIntent(text) {
  const groq = getGroqClient();
  if (!groq) {
    console.log('[Groq] API key not configured — using local heuristic parser');
    return parseHeuristic(text);
  }

  try {
    // Sanitize input to prevent prompt injection
    const sanitizedText = String(text).replace(/["`]/g, '').replace(/\n/g, ' ').substring(0, 500);
    console.log(`[Groq] Parsing intent: "${sanitizedText.slice(0, 80)}"`);
    
    const systemPrompt = `You are the core routing intelligence of PayIT. You analyze raw West African user queries (written in English, Pidgin, Yoruba, Igbo, or Hausa) and output structured JSON execution parameters. Do not output conversational filler. Output strictly valid JSON.

Your target actions are:
1. P2P_TRANSFER: Sending money to another user.
2. CASH_OUT: Triggering a domestic bank transfer in Nigeria.
3. INVOICE_CREATION: Billing a customer.
4. SAVINGS_LOCK: Lock funds for a period with no interest.
5. SAVINGS_YIELD: Lock funds and earn yield (user sees up to 10% APY).
6. SET_AUTOSAVE: Business auto-save percent from invoice inflows.
7. BULK_PAYROLL: Pay multiple staff in stablecoins or fiat.
8. CUSTOMER_DIRECTORY: View saved customers.
9. RECURRING_INVOICE: Set up subscription/retainer billing.
10. EXPENSE_LOG / RECEIPT_OCR: Log a business expense from text or receipt.
11. EXPENSE_REPORT: Tax/expense summary by category.
12. SAVINGS_GOAL: Target-based savings with deadline.
13. SET_LOW_BALANCE_ALERT: Alert when wallet balance is low.
14. SET_PAYROLL_APPROVAL / APPROVE_PAYROLL / REJECT_PAYROLL: Multi-signer payroll.
15. LIST_RECURRING / LIST_EXPENSES / LIST_GOALS: List views.
16. UNRECOGNIZED_COMMAND: Fallback.

Strict JSON Output Schema — action one of:
P2P_TRANSFER | CASH_OUT | INVOICE_CREATION | SAVINGS_LOCK | SAVINGS_YIELD | SET_AUTOSAVE | BULK_PAYROLL |
CUSTOMER_DIRECTORY | RECURRING_INVOICE | LIST_RECURRING | EXPENSE_LOG | RECEIPT_OCR | EXPENSE_REPORT |
LIST_EXPENSES | SAVINGS_GOAL | LIST_GOALS | SET_LOW_BALANCE_ALERT | SET_PAYROLL_APPROVAL |
APPROVE_PAYROLL | REJECT_PAYROLL | UNRECOGNIZED_COMMAND

parameters may include:
amount, currency, recipientIdentifier, bankName, accountNumber, memo, durationDays, saveType,
autoSavePercent, recipients[], frequency, category, merchant, goalTitle, targetAmount, targetDate,
threshold, approverTelegramId, approvalId
`;

    const result = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: sanitizedText }
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    });

    const responseText = result.choices[0].message.content.trim();
    const parsed = JSON.parse(responseText);
    parsed.confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.95;
    parsed.languageDetected = parsed.languageDetected || 'English';
    console.log(`[Groq] Intent: ${parsed.action} (confidence ${parsed.confidence})`);
    return parsed;

  } catch (error) {
    console.warn('[Groq] Intent parsing failed, running heuristic parser:', error.message);
    return parseHeuristic(text);
  }
}

module.exports = {
  parseIntent,
  parseHeuristic
};
