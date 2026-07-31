require('dotenv').config();
const https = require('https');

const API_KEY = process.env.NUVION_API_KEY;
const baseUrl = 'https://api.nuvion.dev';

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
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(raw);
            resolve(parsed);
          } catch (e) {
            resolve(raw);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${raw}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function testRealBVNVerification() {
  const timestamp = Date.now();
  const personPayload = {
    name: "Real BVN Test User",
    person: {
      first_name: "John",
      last_name: "Doe",
      email: `realbvn${timestamp}@payit.app`,
      nationality: "NG",
      bvn: "12345678901", // Test BVN format
      date_of_birth: "1990-01-01",
      gender: "m",
      phonenumber: "+2348000000001"
    },
    address: {
      line_1: "14 Commercial Ave",
      city: "Lagos",
      state: "Lagos",
      postal_code: "100001",
      country_code: "NG"
    },
    meta: { platform_user_id: `test_bvn_${timestamp}` }
  };
  
  console.log("Testing Real BVN Verification with complete data...");
  console.log("Payload:", JSON.stringify(personPayload, null, 2));
  
  try {
    const result = await testNuvion('/individual-entities', personPayload);
    console.log("✅ BVN Verification Success!");
    console.log("Entity ID:", result.data?.entity?.id || result.entity?.id);
    console.log("Person ID:", result.data?.person?.id || result.person?.id);
    return result;
  } catch (err) {
    console.error("❌ BVN Verification Failed:", err.message);
    throw err;
  }
}

async function testRealCACVerification() {
  const timestamp = Date.now();
  const bizPayload = {
    name: "Real CAC Test Business",
    business: {
      legal_name: "Real CAC Test Business Ltd",
      email: `realcac${timestamp}@payit.app`,
      registration_number: `RC${timestamp}`,
      country: "NG",
      type: "LLC",
      industry: "technology",
      tin: "12345678-0001",
      description: "Real Business Verification Test",
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
    },
    meta: { platform_user_id: `test_cac_${timestamp}`, cac_number: `RC${timestamp}` }
  };
  
  console.log("\nTesting Real CAC Verification with complete data...");
  console.log("Payload:", JSON.stringify(bizPayload, null, 2));
  
  try {
    const result = await testNuvion('/business-entities', bizPayload);
    console.log("✅ CAC Verification Success!");
    console.log("Entity ID:", result.data?.entity?.id || result.entity?.id);
    console.log("Business ID:", result.data?.business?.id || result.business?.id);
    return result;
  } catch (err) {
    console.error("❌ CAC Verification Failed:", err.message);
    throw err;
  }
}

async function testAccountProvisioning(entityId) {
  const accountPayload = {
    entity_id: entityId,
    type: 'checking',
    currency: 'NGN',
    display_name: 'PayIT NGN Account',
    meta: { platform_user_id: `test_account_${Date.now()}` }
  };
  
  console.log("\nTesting Real Account Provisioning...");
  console.log("Payload:", JSON.stringify(accountPayload, null, 2));
  
  try {
    const result = await testNuvion('/accounts', accountPayload);
    console.log("✅ Account Creation Success!");
    console.log("Account ID:", result.data?.id || result.id);
    
    // Now test account details provisioning
    const detailsPayload = {
      account_id: result.data?.id || result.id,
      beneficiary_name: 'Test User / PayIT'
    };
    
    console.log("\nTesting Real Account Details Provisioning...");
    const detailsResult = await testNuvion('/account-details', 'POST', detailsPayload);
    console.log("✅ Account Details Success!");
    console.log("Account Number:", detailsResult.data?.account_number || detailsResult.account_number);
    console.log("Issuer:", detailsResult.data?.issuer?.name || detailsResult.issuer?.name);
    
    return { account: result, details: detailsResult };
  } catch (err) {
    console.error("❌ Account Provisioning Failed:", err.message);
    throw err;
  }
}

async function run() {
  try {
    console.log("=== Testing Real Verification Flow ===\n");
    
    // Test 1: Real BVN verification
    const bvnResult = await testRealBVNVerification();
    const bvnEntityId = bvnResult.data?.entity?.id || bvnResult.entity?.id;
    
    // Test 2: Real CAC verification  
    const cacResult = await testRealCACVerification();
    const cacEntityId = cacResult.data?.entity?.id || cacResult.entity?.id;
    
    // Test 3: Real account provisioning with BVN entity
    if (bvnEntityId) {
      await testAccountProvisioning(bvnEntityId);
    }
    
    console.log("\n=== All Real Verification Tests Passed ===");
  } catch (err) {
    console.error("\n=== Verification Tests Failed ===");
    process.exit(1);
  }
}

run();
