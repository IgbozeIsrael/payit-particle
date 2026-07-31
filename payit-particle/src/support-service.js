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

async function handleSupportRequest(user, question) {
  try {
    // Fetch last 10 audit logs for context
    const logs = await dbPg.query(`
      SELECT action, details, timestamp 
      FROM audit_logs 
      WHERE user_id = ? 
      ORDER BY timestamp DESC 
      LIMIT 10
    `, [user.telegram_id]).then(r => r.rows);

    const logContext = logs.map(l => `- Action: ${l.action}, Details: ${l.details}, Time: ${new Date(l.timestamp).toISOString()}`).join('\n');

    const systemPrompt = `
    You are the intelligent Customer Support Agent for PayIT, a crypto wallet built on Particle Network and Arbitrum.
    PayIT features:
    - Universal Accounts (No seed phrases needed)
    - Personal Account: Send money, Split Bills, Escrow, Auto-Save with yield, Utilities (Airtime).
    - Business Account: Invoice creation, AI Receipt Scanning (Groq Vision OCR), Payroll, Auto-Tax Withholding.

    The user is asking a support question. Use the following recent activity logs to understand what they were just doing and provide highly contextual, helpful answers. Keep your answers concise, friendly, and actionable.

    User's Recent Activity Logs:
    ${logContext || 'No recent activity.'}
    `;

    const groq = getGroqClient();
    if (!groq) {
      return { reply: '❌ AI Support is not configured. Please contact support directly.' };
    }

    const sanitizedQuestion = String(question).replace(/["`]/g, '').substring(0, 500);
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: sanitizedQuestion }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
    });

    const reply = chatCompletion.choices[0]?.message?.content || "I'm sorry, I couldn't process your request right now. Please try again later.";
    
    db.createAuditLog({ logId: `log_${Date.now()}_support`, userId: user.telegram_id, action: 'AI_SUPPORT', details: { question } });

    return { reply: `🎧 **AI Support Agent**\n\n${reply}` };
  } catch (error) {
    console.error('Support agent error:', error);
    return { reply: '❌ Sorry, the AI Support Agent is currently unavailable.' };
  }
}

module.exports = { handleSupportRequest };
