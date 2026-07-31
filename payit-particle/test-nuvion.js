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
  const timestamp = Date.now();
  const personPayload = {
    name: "Test User",
    person: {
      first_name: "Test",
      last_name: "User",
      email: `testuser${timestamp}@payit.app`,
      nationality: "NG",
      date_of_birth: "1990-01-01",
      gender: "m",
      phonenumber: "+2348000000000"
    },
    address: {
      line_1: "14 Commercial Ave",
      city: "Lagos",
      state: "Lagos",
      postal_code: "100001",
      country_code: "NG"
    }
  };
  console.log("Testing Individual Entity...");
  await testNuvion('/individual-entities', personPayload);

  const bizPayload = {
    name: "Test Business",
    business: {
      legal_name: "Test Business",
      email: `testbiz${timestamp}@payit.app`,
      registration_number: `RC${timestamp}`,
      country: "NG",
      type: "LLC",
      industry: "technology",
      tin: "12345678-0001",
      description: "Verified Business",
      incorporation_meta: {
        year: 2020,
        month: 1,
        country: "NG",
        state: "Lagos"
      }
    },
    address: {
      line_1: "14 Commercial Ave",
      city: "Lagos",
      state: "Lagos",
      postal_code: "100001",
      country_code: "NG"
    }
  };
  console.log("\nTesting Business Entity...");
  await testNuvion('/business-entities', bizPayload);
}

run();
