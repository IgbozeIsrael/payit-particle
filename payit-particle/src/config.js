require('dotenv').config();

const REQUIRED_ENV_VARS = [
  'KEY_ENCRYPTION_SECRET',
  'TELEGRAM_BOT_TOKEN',
  'PARTICLE_PROJECT_ID',
  'PARTICLE_CLIENT_KEY',
  'PARTICLE_APP_UUID',
  'MAGIC_PUBLISHABLE_KEY',
  'MAGIC_SECRET_KEY',
  'NUVION_API_KEY',
  'NUVION_WEBHOOK_SECRET'
];

function validate() {
  const missing = REQUIRED_ENV_VARS.filter(k => !process.env[k]);

  if (missing.length > 0) {
    const errorMsg = `FATAL CONFIGURATION ERROR: Missing required environment variable(s): ${missing.join(', ')}. Set these variables in your environment or .env file.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

module.exports = { validate };
