/**
 * Netlify Function Proxy
 * ----------------------
 * Thin proxy forwarding any Netlify serverless invocations directly to the live Railway backend.
 */
const https = require('https');

exports.handler = async (event) => {
  const railwayHost = 'payit-particle-payit-particle.up.railway.app';
  const targetPath = event.path.replace(/^\/\.netlify\/functions\/api/, '');
  const path = targetPath.startsWith('/api') ? targetPath : `/api${targetPath}`;

  const queryStr = event.queryStringParameters 
    ? '?' + new URLSearchParams(event.queryStringParameters).toString()
    : '';

  return new Promise((resolve) => {
    const options = {
      hostname: railwayHost,
      path: path + queryStr,
      method: event.httpMethod,
      headers: {
        'content-type': event.headers['content-type'] || 'application/json',
        'authorization': event.headers['authorization'] || '',
        'x-profile-id': event.headers['x-profile-id'] || '',
        'host': railwayHost
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: {
            'content-type': res.headers['content-type'] || 'application/json',
            'access-control-allow-origin': '*',
            'access-control-allow-headers': 'Content-Type, Authorization, X-Profile-ID',
            'access-control-allow-methods': 'GET, POST, OPTIONS'
          },
          body
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        statusCode: 502,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'Proxy request to Railway failed', details: err.message })
      });
    });

    if (event.body) {
      req.write(event.body);
    }
    req.end();
  });
};
