const http = require('http');

function post(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ hostname: 'localhost', port: 3000, path: '/api/mobile/cards/issue', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ statusCode: res.statusCode, body: JSON.parse(buf) }); } catch (e) { resolve({ statusCode: res.statusCode, body: buf }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run(n=30) {
  console.log(`Starting ${n} parallel card issuance requests to http://localhost:3000/api/mobile/cards/issue`);
  const promises = [];
  for (let i=0;i<n;i++) {
    promises.push(post({ card_type: 'virtual', currency: 'USD', context: 'personal' }).then(r => ({ok: r.statusCode===200, r})).catch(e => ({ok:false, err: e.message})));
  }
  const results = await Promise.all(promises);
  const success = results.filter(r => r.ok).length;
  console.log(`Done. ${success}/${n} succeeded.`);
  results.forEach((res, idx) => {
    if (!res.ok) console.log(`#${idx+1} FAILED:`, res.err || res.r && res.r.statusCode, res.r && res.r.body);
  });
}

const n = parseInt(process.argv[2]) || 30;
run(n).catch(e => { console.error('Error during concurrency test:', e); process.exit(1); });
