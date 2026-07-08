const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Parse the comma-separated whitelist of Telegram user IDs into a Set of numbers.
const allowedUserIds = new Set(
  (process.env.ALLOWED_TELEGRAM_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n))
);

const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  allowedUserIds,
  siteApiBase: (process.env.SITE_API_BASE || 'http://localhost:5000/api').replace(/\/+$/, ''),
  adminUsername: process.env.ADMIN_USERNAME || '',
  adminPassword: process.env.ADMIN_PASSWORD || ''
};

// Fail fast with a clear message if the essentials are missing.
function assertConfig() {
  const missing = [];
  if (!config.telegramToken) missing.push('TELEGRAM_BOT_TOKEN');
  if (!config.adminUsername) missing.push('ADMIN_USERNAME');
  if (!config.adminPassword) missing.push('ADMIN_PASSWORD');
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      'Copy .env.example to .env and fill it in.'
    );
  }
}

module.exports = { config, assertConfig };
