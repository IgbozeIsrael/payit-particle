const handleMobileApi = require('../../../src/mobile-api');
const { URL } = require('url');

exports.handler = async (event, context) => {
  // CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Profile-ID',
      },
      body: '',
    };
  }

  // Normalize request path so /api/mobile/... routes cleanly
  let rawPath = event.path || '/';
  if (rawPath.startsWith('/.netlify/functions/api')) {
    rawPath = rawPath.replace(/^\/\.netlify\/functions\/api/, '');
  }
  if (!rawPath.startsWith('/api') && rawPath.startsWith('/')) {
    rawPath = '/api' + rawPath;
  }

  const urlString = `https://${event.headers.host || 'payitng.netlify.app'}${rawPath}`;
  const requestUrl = new URL(urlString);

  const bodyBuffer = Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8');

  let statusCode = 200;
  let responseHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };
  let responseBody = '';

  const mockReq = {
    method: event.httpMethod,
    headers: event.headers || {},
    on: (evt, cb) => {
      if (evt === 'data') cb(bodyBuffer);
      if (evt === 'end') cb();
    },
  };

  const mockRes = {
    writeHead: (code, headers) => {
      statusCode = code;
      if (headers) Object.assign(responseHeaders, headers);
    },
    end: (chunk) => {
      if (chunk) responseBody += chunk.toString();
    },
  };

  try {
    await handleMobileApi(mockReq, mockRes, requestUrl);
    return {
      statusCode,
      headers: responseHeaders,
      body: responseBody,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({ error: err.message || 'Internal Server Error' }),
    };
  }
};
