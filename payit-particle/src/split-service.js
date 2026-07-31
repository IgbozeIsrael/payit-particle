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

async function parseSplitIntent(text) {
  try {
    const groq = getGroqClient();
    if (!groq) return null;

    // Sanitize input to prevent prompt injection
    const sanitizedText = String(text).replace(/["`]/g, '').replace(/\n/g, ' ').substring(0, 500);

    const prompt = `
    You are an AI assistant parsing a "split bill" intent for a crypto wallet.
    Extract the total amount to split, the currency, and the list of telegram usernames (starting with @) that the user wants to split the bill with.
    
    Return a strict JSON object with this structure:
    {
      "totalAmount": 100,
      "currency": "USDC",
      "participants": ["@john", "@mary"]
    }
    
    If the user does not specify an amount or participants, return an empty object or null.
    
    User Text: "${sanitizedText}"
    `;

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama3-8b-8192',
      temperature: 0,
      response_format: { type: 'json_object' }
    });

    const content = chatCompletion.choices[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content);
  } catch (error) {
    console.error('Error parsing split intent:', error);
    return null;
  }
}

async function handleSplitCommand(user, text) {
  // If the text is just "split bill", ask for details
  if (text.toLowerCase() === 'split bill' || text === '🪓 split bill') {
    return {
      reply: '🪓 **Split Bill**\n\nTo split a bill, tell me the total amount and who to split with.\n\nExample: *"Split 50 USDC with @alice and @bob"*'
    };
  }

  const intent = await parseSplitIntent(text);

  if (!intent || !intent.totalAmount || !intent.participants || intent.participants.length === 0) {
    return {
      reply: '❌ I could not understand the split details. Please specify the amount and use @usernames.\n\nExample: *"Split 50 USDC with @alice and @bob"*'
    };
  }

  // Calculate split
  // The creator is also part of the split! So if I split $50 with 2 friends, there are 3 people total.
  const totalPeople = intent.participants.length + 1; 
  const amountPerPerson = (intent.totalAmount / totalPeople).toFixed(2);

  const splitId = `split_${Date.now()}`;
  
  // Save to DB
  db.createSplitBill({
    splitId,
    creatorId: user.telegram_id,
    totalAmount: intent.totalAmount,
    currency: intent.currency || 'USDC'
  });

  // Log audit
  db.createAuditLog({
    logId: `log_${Date.now()}_split`,
    userId: user.telegram_id,
    action: 'CREATE_SPLIT_BILL',
    details: { totalAmount: intent.totalAmount, participants: intent.participants }
  });

  let participantList = '';
  for (const username of intent.participants) {
    db.addSplitParticipant({
      splitId,
      username: username.replace('@', ''),
      amountOwed: parseFloat(amountPerPerson)
    });
    participantList += `• ${username}: **${amountPerPerson} ${intent.currency || 'USDC'}**\n`;
  }

  return {
    reply: `🪓 **Bill Split Successfully!**\n\n` +
           `Total Amount: **${intent.totalAmount} ${intent.currency || 'USDC'}**\n` +
           `Split between ${totalPeople} people (including you).\n\n` +
           `**Pending Collections:**\n` +
           participantList + `\n` +
           `I will notify you when they pay their share into your Smart Account.`
  };
}

module.exports = {
  handleSplitCommand
};
