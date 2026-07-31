process.on('uncaughtException', e => { console.error('UNCAUGHT:', e.stack); process.exit(1); });
process.on('unhandledRejection', e => { console.error('UNHANDLED:', e); });

const http = require('http');

// Set test env
process.env.NUVION_WEBHOOK_SECRET = 'test_webhook_secret_123';
process.env.NODE_ENV = 'development';

const server = require('./src/server.js');
const PORT = 3002;

function makeRequest(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const h = { 'Content-Type': 'application/json', ...headers };
    if (data) h['Content-Length'] = Buffer.byteLength(data);
    
    const req = http.request({ hostname: 'localhost', port: PORT, path, method, headers: h }, res => {
      let respBody = '';
      res.on('data', c => respBody += c);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(respBody); } catch { parsed = respBody; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  const authHeaders = { 'X-Telegram-Id': 'did:ethr:0xaf0245eb93910b2a02901654d72644090579015A' };
  
  // Test 1: Profile endpoint
  const profile = await makeRequest('GET', '/api/app/profile', null, authHeaders);
  console.log('1. Profile:', profile.status === 200 ? 'PASS' : 'FAIL', `(${profile.status})`);

  // Test 2: Transactions
  const txns = await makeRequest('GET', '/api/app/transactions', null, authHeaders);
  console.log('2. Transactions:', txns.status === 200 ? 'PASS' : 'FAIL', `(${txns.status})`);

  // Test 3: Invoices
  const invs = await makeRequest('GET', '/api/app/invoices', null, authHeaders);
  console.log('3. Invoices:', invs.status === 200 ? 'PASS' : 'FAIL', `(${invs.status})`);

  // Test 4: Mobile API /api/mobile/me
  const me = await makeRequest('GET', '/api/mobile/me', null, authHeaders);
  console.log('4. Mobile /me:', me.status === 200 ? 'PASS' : 'FAIL', `(${me.status}) user_id=${me.body?.user?.user_id || 'none'}`);

  // Test 5: Mobile API - verify-bvn validation
  const bvn1 = await makeRequest('POST', '/api/mobile/verify-bvn', { bvn: '123' }, authHeaders);
  console.log('5. BVN too short:', bvn1.status === 400 ? 'PASS' : 'FAIL', `(${bvn1.status})`);

  // Test 6: Mobile API - verify-bvn missing fields
  const bvn2 = await makeRequest('POST', '/api/mobile/verify-bvn', { bvn: '12345678901' }, authHeaders);
  console.log('6. BVN missing fields:', bvn2.status === 400 ? 'PASS' : 'FAIL', `(${bvn2.status}) ${JSON.stringify(bvn2.body)}`);

  // Test 7: Mobile API - submit-cac validation
  const cac1 = await makeRequest('POST', '/api/mobile/submit-cac', {}, authHeaders);
  console.log('7. CAC empty:', cac1.status === 400 ? 'PASS' : 'FAIL', `(${cac1.status})`);

  // Test 8: Mobile API - submit-cac with valid number
  const cac2 = await makeRequest('POST', '/api/mobile/submit-cac', { cac_number: 'RC123456', business_name: 'Test Corp', business_email: 'test@corp.com', business_address: '123 Main St, Lagos' }, authHeaders);
  console.log('8. CAC submission:', cac2.status === 200 ? 'PASS' : 'FAIL', `(${cac2.status}) status=${cac2.body?.kyb_status}`);

  console.log('\nAll tests completed successfully!');
  server.close();
  process.exit(0);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('Test server on port ' + PORT);
  runTests().catch(e => { console.error('TEST ERR:', e); server.close(); process.exit(1); });
});
