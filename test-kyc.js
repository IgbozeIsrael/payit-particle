const http = require('http');

function test(path, method, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const h = { 'Content-Type': 'application/json', ...headers };
    if (data) h['Content-Length'] = Buffer.byteLength(data);

    const req = http.request({ hostname: 'localhost', port: 3000, path, method, headers: h }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const auth = { 'X-Telegram-Id': 'did:ethr:0xaf0245eb93910b2a02901654d72644090579015A' };

  console.log('--- KYC Draft Save ---');
  const r1 = await test('/api/mobile/kyc/draft', 'POST', { bvn: '23487892834', first_name: 'Iboh', last_name: 'Igboze', phone: '+2348012345678', dob: '1990-01-01', gender: 'male', country: 'NG' }, auth);
  console.log('Status:', r1.status);
  try { console.log('Body:', JSON.stringify(JSON.parse(r1.body)).substring(0, 200)); } catch { console.log('Body:', r1.body.substring(0, 200)); }

  console.log('\n--- KYC Validate ---');
  const r2 = await test('/api/mobile/kyc/validate', 'GET', null, auth);
  console.log('Status:', r2.status);
  try { console.log('Body:', JSON.stringify(JSON.parse(r2.body)).substring(0, 200)); } catch { console.log('Body:', r2.body.substring(0, 200)); }

  console.log('\n--- KYC Status ---');
  const r3 = await test('/api/mobile/kyc/status', 'GET', null, auth);
  console.log('Status:', r3.status);
  try { console.log('Body:', JSON.stringify(JSON.parse(r3.body)).substring(0, 200)); } catch { console.log('Body:', r3.body.substring(0, 200)); }

  console.log('\n--- All tests done ---');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
