const { Groq } = require('groq-sdk');
const db = require('./db');

// Reuse Groq client
let _groq = null;
function getGroqClient() {
  if (!_groq) {
    const apiKey = process.env.GROQ_API_KEY;
    if (apiKey && !apiKey.startsWith('mock_') && apiKey !== 'YOUR_GROQ_API_KEY') {
      _groq = new Groq({ apiKey });
    }
  }
  return _groq;
}

async function parseReceiptImage(telegramId, imageBuffer) {
  const groq = getGroqClient();
  if (!groq) {
    return { reply: '❌ Groq API key is missing. Cannot parse receipt.' };
  }

  const base64 = imageBuffer.toString('base64');

  try {
    const prompt = `
    You are an AI assistant parsing a vendor receipt for a business expense system.
    Extract the total amount, the currency (default to USDC if unknown), the merchant name, and a short description/category.
    
    Return a strict JSON object:
    {
      "amount": 45.99,
      "currency": "USDC",
      "merchant": "Amazon Web Services",
      "category": "Cloud Hosting",
      "description": "Monthly server bill"
    }
    
    If the image is not a receipt, return {"error": "Not a receipt"}.
    `;

    const result = await groq.chat.completions.create({
      model: 'llama-3.2-90b-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
          ]
        }
      ],
      temperature: 0,
      response_format: { type: 'json_object' }
    });

    const parsed = JSON.parse(result.choices[0].message.content.trim());
    
    if (parsed.error) {
      return { reply: '❌ I could not read a receipt from that image. Please try again with a clearer photo.' };
    }

    const expenseId = `exp_${Date.now()}`;
    db.createExpense({
      expenseId,
      userId: telegramId,
      amount: parsed.amount,
      currency: parsed.currency || 'USDC',
      category: parsed.category || 'General',
      merchant: parsed.merchant || 'Unknown',
      description: parsed.description || 'Receipt scan',
      receiptRef: 'telegram_upload'
    });

    db.createAuditLog({
      logId: `log_${Date.now()}_ocr`,
      userId: telegramId,
      action: 'SCAN_RECEIPT',
      details: { amount: parsed.amount, merchant: parsed.merchant }
    });

    return {
      keyboard: 'business',
      reply: `📸 **Receipt Scanned Successfully!**\n\n` +
             `Merchant: **${parsed.merchant}**\n` +
             `Amount: **${parsed.amount} ${parsed.currency || 'USDC'}**\n` +
             `Category: ${parsed.category}\n\n` +
             `This expense has been automatically logged to your Balance Sheet.`
    };

  } catch (error) {
    console.error('Vision parse error:', error);
    return { reply: '❌ An error occurred while parsing the receipt.' };
  }
}

module.exports = { parseReceiptImage };
