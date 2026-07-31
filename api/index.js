const mobileApi = require('../payit-particle/src/mobile-api');

module.exports = async (req, res) => {
  const host = req.headers.host || 'localhost';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const requestUrl = new URL(req.url, `${protocol}://${host}`);
  
  return mobileApi(req, res, requestUrl);
};
