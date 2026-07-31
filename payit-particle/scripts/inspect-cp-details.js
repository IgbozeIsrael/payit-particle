const https = require('https');
require('dotenv').config();

const API_KEY = process.env.NUVION_API_KEY;

function requestNuv(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.nuvion.co',
      port: 443,
      path: path,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    }, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch (e) { resolve({ status: res.statusCode, raw: d }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('--- Inspecting Counterparty 01KYA8VZY1SXAHENF5JTDAV2KG ---');
  const cp = await requestNuv('/counterparties/01KYA8VZY1SXAHENF5JTDAV2KG');
  console.log('Counterparty Info:', JSON.stringify(cp.data, null, 2));
}

run().catch(console.error);
