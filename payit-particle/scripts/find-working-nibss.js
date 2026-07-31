const https = require('https');

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyStr = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : null;
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        ...(bodyStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        ...(options.headers || {})
      }
    }, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch (e) { resolve({ status: res.statusCode, raw: d.slice(0, 300) }); }
      });
    });
    req.on('error', err => resolve({ status: 0, error: err.message }));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function testAll() {
  const accNo = '8175802032';
  console.log(`Resolving real NIBSS account details for ${accNo}...`);

  const tests = [
    // Paystack public resolution proxy endpoints
    { name: 'Paystack via direct resolution proxy 1', url: `https://api.paystack.co/bank/resolve?account_number=${accNo}&bank_code=999992` },
    { name: 'Paystack via direct resolution proxy 2', url: `https://api.paystack.co/bank/resolve?account_number=${accNo}&bank_code=100004` },
    // OPay direct resolution endpoint
    { name: 'OPay Merchant Portal Lookup', url: `https://cashier.opayweb.com/api/v1/pub/account/resolve`, method: 'POST', body: { accountNumber: accNo, bankCode: '999992' } },
    // Flutterwave public lookup
    { name: 'Flutterwave Public Lookup', url: `https://api.flutterwave.com/v3/accounts/resolve`, method: 'POST', body: { account_number: accNo, account_bank: '999992' } },
    // Monnify public lookup
    { name: 'Monnify Public Lookup', url: `https://api.monnify.com/api/v1/disbursements/account/validate?accountNumber=${accNo}&bankCode=999992` },
    // Ravenbank lookup
    { name: 'Ravenbank Lookup', url: `https://api.ravenbank.com/v1/account/verify`, method: 'POST', body: { account_number: accNo, bank_code: '999992' } },
    // Kuda / VFD public lookup
    { name: 'VFD Account Lookup', url: `https://vfdservice.com/api/v1/account/enquiry?accountNumber=${accNo}` },
    // Kuda App Lookup API
    { name: 'Kuda Name Enquiry', url: `https://kuda-name-enquiry.p.rapidapi.com/name-enquiry?account_number=${accNo}&bank_code=999992` }
  ];

  for (const t of tests) {
    const res = await fetchUrl(t.url, t);
    console.log(`[${t.name}] (${res.status}):`, JSON.stringify(res.data || res.raw || res.error));
  }
}

testAll();
