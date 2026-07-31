const { Groq } = require('groq-sdk');
const db = require('./db');

// Reuse Groq client
let _groq = null;
function getGroqClient() {
  if (!_groq) {
    const apiKey = process.env.GROQ_API_KEY;
    if (apiKey && !apiKey.startsWith('mock_')) {
      _groq = new Groq({ apiKey });
    }
  }
  return _groq;
}

async function parseEscrowIntent(text) {
  try {
    // Sanitize input to prevent prompt injection
    const sanitizedText = text.replace(/["`]/g, '').replace(/\n/g, ' ').substring(0, 500);
    
    const groq = getGroqClient();
    if (!groq) return null;

    const prompt = `
    You are an AI assistant parsing an "escrow" intent for a crypto wallet.
    Extract the amount to lock, the currency, and the telegram username (starting with @) of the seller.
    
    Return a strict JSON object:
    { "amount": 100, "currency": "USDC", "seller": "@seller" }
    
    If missing, return null.
    User Text: "${sanitizedText}"`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama3-8b-8192',
      temperature: 0,
      response_format: { type: 'json_object' }
    });

    const content = chatCompletion.choices[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    // Validate parsed result
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.amount && (typeof parsed.amount !== 'number' || parsed.amount <= 0 || parsed.amount > 1000000)) return null;
    if (parsed.seller && typeof parsed.seller !== 'string') return null;
    return parsed;
  } catch (error) {
    return null;
  }
}

async function handleEscrowCommand(user, text) {
  if (text.toLowerCase() === 'escrow' || text === '🤝 escrow') {
    return { reply: '🤝 **Escrow Service**\n\nBuy/Sell safely. Tell me the amount and the seller.\n\nExample: *"Lock 100 USDC in escrow for @seller"*' };
  }

  const intent = await parseEscrowIntent(text);
  if (!intent || !intent.amount || !intent.seller) {
    return { reply: '❌ I could not understand the escrow details. Please specify the amount and use @username.\n\nExample: *"Lock 100 USDC in escrow for @seller"*' };
  }

  const escrowId = `esc_${Date.now()}`;
  
  dbPg.query(`
    INSERT INTO escrows (escrow_id, buyer_id, seller_id, amount, currency, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'locked', ?)
  `).run(escrowId, user.telegram_id, intent.seller.replace('@', ''), intent.amount, intent.currency || 'USDC', Date.now());

  db.createAuditLog({
    logId: `log_${Date.now()}_escrow`,
    userId: user.telegram_id,
    action: 'CREATE_ESCROW',
    details: { amount: intent.amount, seller: intent.seller }
  });

  return {
    reply: `🤝 **Funds Locked in Escrow**\n\n` +
           `Amount: **${intent.amount} ${intent.currency || 'USDC'}**\n` +
           `Seller: **${intent.seller}**\n\n` +
           `The funds have been secured by the PayIT Smart Contract.\n\n` +
           `When you receive your goods/services, reply with:\n\`/release ${escrowId}\``
  };
}

module.exports = { handleEscrowCommand };
