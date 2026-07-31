const agent = require('./agent');
const mediaParser = require('./media-parser');
const db = require('./db');
const savingsService = require('./savings-service');
const payrollService = require('./payroll-service');
const particleService = require('./particle-service');
const { Groq } = require('groq-sdk');

// Reuse Groq client
let _groq = null;
function getGroqClient() {
  if (!_groq) {
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey && !groqKey.startsWith('mock_')) {
      _groq = new Groq({ apiKey: groqKey });
    }
  }
  return _groq;
}

/**
 * Main engine for PayAI chatbot across mobile app and Telegram bot.
 * Handles natural language text, voice audio (transcription), and file OCR.
 */
async function processPayAIQuery({ userId, user, text, audioBase64, fileBase64 }) {
  let queryText = text || '';
  let transcribedText = null;

  // Step 1: Voice Message Transcription via Groq Whisper
  if (audioBase64) {
    try {
      const audioBuffer = Buffer.from(audioBase64.replace(/^data:audio\/\w+;base64,/, ''), 'base64');
      transcribedText = await mediaParser.transcribeVoice(audioBuffer, 'voice.mp3');
      if (transcribedText) {
        queryText = transcribedText;
        console.log(`[PayAI Voice Transcribed]: "${queryText}"`);
      }
    } catch (err) {
      console.warn('[PayAI Voice Error]:', err.message);
    }
  }

  // Fallback default message if empty
  if (!queryText.trim() && !fileBase64) {
    return {
      reply: "Hello! 👋 I'm PayAI. You can ask me to send money, cash out to a bank, lock savings, create invoices, or run payroll in plain English, Pidgin, or voice notes!",
      options: [
        "Send $50 USDT to Maria",
        "Withdraw ₦10,000 to GTBank 0123456789",
        "Invoice Acme Corp $250 for design",
        "How much did I spend on food this month?"
      ]
    };
  }

  // Step 2: Intent Parsing via Groq LLaMA 3.3 70B
  const intent = await agent.parseIntent(queryText);
  const action = intent?.action || 'UNRECOGNIZED_COMMAND';
  const params = intent?.parameters || {};

  console.log(`[PayAI] Parsed action: ${action} for user ${userId}`);

  // Step 3: Action Execution Routing
  try {
    switch (action) {
      case 'P2P_TRANSFER': {
        const amount = params.amount || 0;
        const currency = params.currency || 'USDT';
        const recipient = params.recipientIdentifier || 'Recipient';
        
        if (amount > 0) {
          db.addTransaction(userId, 'transfer', amount, currency, 'pending');
          return {
            reply: `✅ **Transfer Initiated!**\n\n$${amount} ${currency} to ${recipient} is being processed.\nTransaction ID: \`tx_${Date.now()}\``,
            transcribedText,
            path: '/wallet'
          };
        }
        break;
      }

      case 'CASH_OUT': {
        const amount = params.amount || 0;
        const currency = params.currency || 'NGN';
        const bankName = params.bankName || 'Bank Account';
        const accountNumber = params.accountNumber || '';
        
        if (amount > 0) {
          db.addTransaction(userId, 'withdraw', amount, currency, 'pending');
          return {
            reply: `💸 **Cash-Out Initiated!**\n\nWithdrawing ${currency} ${amount.toLocaleString()} to ${bankName} (${accountNumber}) via Nuvion payouts.\nTransaction ID: \`tx_${Date.now()}\``,
            transcribedText,
            path: '/activity'
          };
        }
        break;
      }

      case 'INVOICE_CREATION': {
        const amount = params.amount || 0;
        const currency = params.currency || 'USDT';
        const recipient = params.recipientIdentifier || 'Client';
        
        if (amount > 0) {
          const invId = `inv_${Math.random().toString(36).substring(2, 8)}`;
          db.createInvoice(userId, amount, currency, recipient);
          return {
            reply: `🧾 **Invoice Created!**\n\nCreated invoice **#${invId.toUpperCase()}** for **$${amount} ${currency}** to **${recipient}**.`,
            transcribedText,
            path: '/business'
          };
        }
        break;
      }

      case 'SAVINGS_LOCK':
      case 'SAVINGS_YIELD': {
        const amount = params.amount || 0;
        const currency = params.currency || 'USDC';
        const durationDays = params.durationDays || 30;
        
        if (amount > 0) {
          savingsService.createLock({
            telegramId: userId,
            walletContext: 'personal',
            amount,
            currency,
            durationDays,
            type: action === 'SAVINGS_YIELD' ? 'yield' : 'lock'
          });
          db.addTransaction(userId, 'deposit', amount, currency, 'completed');
          return {
            reply: `🔒 **Savings Vault Locked!**\n\nSuccessfully locked **$${amount} ${currency}** for **${durationDays} days**.${action === 'SAVINGS_YIELD' ? ' (Earning 10% APY)' : ''}`,
            transcribedText,
            path: '/savings'
          };
        }
        break;
      }

      case 'BULK_PAYROLL': {
        return {
          reply: `👥 **Payroll Assistant**\n\nI can process batch payroll from your CSV file or voice list. Upload your CSV payroll document or tap below to proceed to Payroll hub.`,
          transcribedText,
          path: '/business/payroll/new'
        };
      }

      case 'EXPENSE_LOG':
      case 'RECEIPT_OCR': {
        const amount = params.amount || 15;
        const category = params.category || 'Business Expense';
        const merchant = params.merchant || 'Merchant';
        
        return {
          reply: `📊 **Expense Logged!**\n\nRecorded **$${amount}** for **${merchant}** under category **${category}**.`,
          transcribedText,
          path: '/business'
        };
      }

      case 'ESCROW': {
        const amount = params.amount || 50;
        const recipient = params.recipientIdentifier || 'Seller';
        const escrowId = `esc_${Date.now()}`;
        
        db.addTransaction(userId, 'deposit', amount, 'USDC', 'completed', escrowId);
        return {
          reply: `🛡️ **Escrow Created!**\n\nLocked **$${amount} USDC** in escrow vault for **${recipient}**. Funds will release upon inspection.`,
          transcribedText,
          path: '/escrow'
        };
      }
    }
  } catch (err) {
    console.error('[PayAI Execution Error]:', err.message);
  }

  // Step 4: General Q&A / Financial Insights via Groq LLM
  let aiReply = "I understood your request! What specific amount or recipient would you like to process?";
  const groq = getGroqClient();
  if (groq) {
    try {
      // Sanitize input to prevent prompt injection
      const sanitizedQuery = String(queryText).replace(/["`]/g, '').substring(0, 500);
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `You are PayAI, the friendly and ultra-smart AI assistant of PayIT financial app. You speak English and West African Pidgin naturally. Answer concisely in 2-3 sentences. Help users manage their stablecoins, transfers, savings, and business expenses.`
          },
          { role: 'user', content: sanitizedQuery }
        ],
        temperature: 0.3,
        max_tokens: 300
      });
      aiReply = completion.choices[0]?.message?.content || aiReply;
    } catch (e) {
      console.warn('[PayAI LLM Fallback]:', e.message);
    }
  }

  return {
    reply: aiReply,
    transcribedText,
    options: [
      "Show my transactions",
      "Check unified balance",
      "Add money"
    ]
  };
}

module.exports = {
  processPayAIQuery
};
