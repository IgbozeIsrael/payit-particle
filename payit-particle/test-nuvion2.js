require('dotenv').config();
const https = require('https');

const API_KEY = process.env.NUVION_API_KEY;
const baseUrl = 'https://api.nuvion.co';

async function testNuvion(endpoint, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${endpoint}`);
    const body = JSON.stringify(payload);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        console.log(`HTTP ${res.statusCode}`);
        console.log(`Response: ${raw}`);
        resolve();
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function run() {
  console.log("Testing GET /entities...");
  await testNuvion('/entities', null);
  console.log("Testing GET /individual-entities...");
  await testNuvion('/individual-entities', null);
  console.log("Testing GET /business-entities...");
  await testNuvion('/business-entities', null);
}
run();
