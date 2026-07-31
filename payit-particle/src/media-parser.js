const Groq = require('groq-sdk');
const fs = require('fs');
const os = require('os');
const path = require('path');
const agent = require('./agent');

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

const SAVINGS_PROMPT = `Extract savings intent from user content. Return JSON only:
{
  "action": "SAVINGS_LOCK" | "SAVINGS_YIELD" | "SET_AUTOSAVE" | "BULK_PAYROLL" | "UNRECOGNIZED_COMMAND",
  "confidence": number,
  "parameters": {
    "amount": number | null,
    "currency": "USDC" | "EURC" | "NGN",
    "durationDays": number | null,
    "saveType": "lock" | "yield" | null,
    "autoSavePercent": number | null,
    "recipients": [{ "name": string, "amount": number, "currency": string, "destination": string | null }] | null,
    "memo": string | null
  }
}`;

function parseHeuristicFromTranscript(text) {
  const clean = String(text || '').toLowerCase();

  const autosave = clean.match(/(?:auto[- ]?save|save)\s+(\d+(?:\.\d+)?)\s*%?\s+(?:of\s+)?(?:every\s+)?invoice/);
  if (autosave) {
    return {
      action: 'SET_AUTOSAVE',
      confidence: 0.9,
      parameters: {
        autoSavePercent: parseFloat(autosave[1]),
        saveType: clean.includes('yield') ? 'yield' : 'lock',
        amount: null,
        currency: 'USDC',
        durationDays: null,
        recipients: null,
        memo: text
      }
    };
  }

  const saveYield = clean.match(/(?:save|lock)\s+([\d,.]+)\s*(usdc|ngn|eurc)?\s+(?:for|until)\s+(\d+)\s*(day|days|week|weeks|month|months|year|years)/);
  if (saveYield) {
    let durationDays = parseInt(saveYield[3], 10);
    const unit = saveYield[4];
    if (unit.startsWith('week')) durationDays *= 7;
    if (unit.startsWith('month')) durationDays *= 30;
    if (unit.startsWith('year')) durationDays *= 365;

    const withYield = clean.includes('yield') || clean.includes('interest') || clean.includes('earn');
    return {
      action: withYield ? 'SAVINGS_YIELD' : 'SAVINGS_LOCK',
      confidence: 0.9,
      parameters: {
        amount: parseFloat(saveYield[1].replace(/,/g, '')),
        currency: (saveYield[2] || 'USDC').toUpperCase(),
        durationDays,
        saveType: withYield ? 'yield' : 'lock',
        autoSavePercent: null,
        recipients: null,
        memo: text
      }
    };
  }

  return agent.parseHeuristic(text);
}

async function parseWithGroq({ systemPrompt, userContent, model }) {
  const groq = getGroqClient();
  if (!groq) return null;

  // Sanitize input to prevent prompt injection
  const sanitizedContent = String(userContent).replace(/["`]/g, '').substring(0, 2000);

  const result = await groq.chat.completions.create({
    model: model || 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: sanitizedContent }
    ],
    temperature: 0.1,
    max_tokens: 700,
    response_format: { type: 'json_object' }
  });

  return JSON.parse(result.choices[0].message.content.trim());
}

async function parseTranscript(transcript) {
  try {
    const parsed = await parseWithGroq({
      systemPrompt: SAVINGS_PROMPT,
      userContent: transcript
    });
    if (parsed && parsed.action) {
      return parsed;
    }
  } catch (error) {
    console.warn('[MediaParser] Transcript Groq parse failed:', error.message);
  }
  return parseHeuristicFromTranscript(transcript);
}

async function parseDocumentText(documentText) {
  const payrollHint = /(salary|payroll|staff|employee)/i.test(documentText);
  const systemPrompt = payrollHint
    ? `${SAVINGS_PROMPT}\nIf this is a payroll file, set action BULK_PAYROLL and parse all rows into recipients.`
    : SAVINGS_PROMPT;

  try {
    const parsed = await parseWithGroq({
      systemPrompt,
      userContent: documentText.slice(0, 12000)
    });
    if (parsed && parsed.action) {
      return parsed;
    }
  } catch (error) {
    console.warn('[MediaParser] Document Groq parse failed:', error.message);
  }

  return parseHeuristicFromTranscript(documentText);
}

async function parseImageDescription(description) {
  return parseTranscript(description);
}

async function transcribeVoice(audioBuffer, filename = 'voice.ogg') {
  const groq = getGroqClient();
  if (!groq) return null;

  const tempPath = path.join(os.tmpdir(), `payit_${Date.now()}_${filename}`);
  fs.writeFileSync(tempPath, audioBuffer);

  try {
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: 'whisper-large-v3-turbo'
    });
    return transcription.text || null;
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch (_) {
      // ignore cleanup errors
    }
  }
}

async function parseVoiceNote(audioBuffer) {
  const transcript = await transcribeVoice(audioBuffer);
  if (!transcript) {
    return parseHeuristicFromTranscript('');
  }
  console.log(`[MediaParser] Voice transcript: "${transcript.slice(0, 80)}"`);
  return parseTranscript(transcript);
}

async function parseImageBuffer(imageBuffer) {
  const groq = getGroqClient();
  if (!groq) {
    return parseHeuristicFromTranscript('save money from image');
  }

  const base64 = imageBuffer.toString('base64');
  try {
    const result = await groq.chat.completions.create({
      model: 'llama-3.2-90b-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `${SAVINGS_PROMPT}\nDescribe any payment/savings/payroll intent visible in this image as JSON.` },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 700,
      response_format: { type: 'json_object' }
    });
    return JSON.parse(result.choices[0].message.content.trim());
  } catch (error) {
    console.warn('[MediaParser] Vision parse failed:', error.message);
    return parseHeuristicFromTranscript('');
  }
}

async function parseBulkPayrollDocument(documentText) {
  const groq = getGroqClient();
  if (!groq) return null;

  const systemPrompt = `You are a financial NLP parser for payroll documents. Extract all employee/recipient payment entries from the provided document text.
Return a valid JSON object matching this exact schema:
{
  "title": string,
  "recipients": [
    {
      "name": string,
      "amount": number,
      "currency": "NGN" | "USD" | "EUR" | "GBP" | "USDT" | "USDC",
      "account_number": string | null,
      "bank_name": string | null,
      "bank_code": string | null,
      "crypto_address": string | null,
      "destination": string | null
    }
  ]
}`;

  try {
    const sanitized = String(documentText).substring(0, 4000);
    const result = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: sanitized }
      ],
      temperature: 0.1,
      max_tokens: 1500,
      response_format: { type: 'json_object' }
    });

    const parsed = JSON.parse(result.choices[0].message.content.trim());
    return Array.isArray(parsed.recipients) ? parsed.recipients : [];
  } catch (err) {
    console.warn(`[Groq Payroll Parsing Warning] ${err.message}`);
    return null;
  }
}

module.exports = {
  parseTranscript,
  parseDocumentText,
  parseImageDescription,
  parseHeuristicFromTranscript,
  parseVoiceNote,
  parseImageBuffer,
  transcribeVoice,
  parseBulkPayrollDocument
};
