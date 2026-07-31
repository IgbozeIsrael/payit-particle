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
  console.log('--- Inspecting Nuvion Transfer Details ---');
  
  // Get transfer details for successful transfer 01KYA93P649P75BVAP0EQN4CRH
  const t1 = await requestNuv('/transfers/01KYA93P649P75BVAP0EQN4CRH', 'GET');
  console.log('Successful transfer details:', JSON.stringify(t1.data, null, 2));

  // Get transfer details for pending/failed transfer 01KYAK1JJQPD5QV5T3K6CYVMRJ
  const t2 = await requestNuv('/transfers/01KYAK1JJQPD5QV5T3K6CYVMRJ', 'GET');
  console.log('Pending/failed transfer details:', JSON.stringify(t2.data, null, 2));
}

run().catch(console.error);
