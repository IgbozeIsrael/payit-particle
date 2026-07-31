const https = require('https');
require('dotenv').config();

const API_KEY = process.env.NUVION_API_KEY;

function requestNuv(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const dataStr = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.nuvion.co',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        ...(dataStr ? { 'Content-Length': Buffer.byteLength(dataStr) } : {})
      }
    }, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch (e) { resolve({ status: res.statusCode, raw: d }); }
      });
    });
    req.on('error', reject);
    if (dataStr) req.write(dataStr);
    req.end();
  });
}

async function run() {
  console.log('--- Inspecting Nuvion Entity, Accounts, and Balance ---');

  // 1. Get Accounts
  const accs = await requestNuv('/accounts', 'GET');
  console.log('Accounts:', JSON.stringify(accs.data, null, 2));

  // 2. Get Business Entities
  const biz = await requestNuv('/business-entities', 'GET');
  console.log('Business Entities:', JSON.stringify(biz.data, null, 2));

  // 3. Get Individual Entities
  const ind = await requestNuv('/individual-entities', 'GET');
  console.log('Individual Entities:', JSON.stringify(ind.data, null, 2));
}

run().catch(console.error);
