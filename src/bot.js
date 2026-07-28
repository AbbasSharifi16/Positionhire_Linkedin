const TelegramBot = require('node-telegram-bot-api');
const { config, assertConfig } = require('./config');
const { normalizeToEmbedUrl } = require('./linkedin');
const { createPosting } = require('./api');

assertConfig();

// Long-poll for up to 50s per request, but give the HTTP socket a 60s hard
// timeout. Without a socket timeout, a wedged connection can hang forever with
// no error — the process stays "online" while it silently stops receiving
// messages (and PM2 never restarts it because nothing crashed). The 60s socket
// timeout (> the 50s long-poll) turns a hung poll into a polling_error that the
// library then retries.
const bot = new TelegramBot(config.telegramToken, {
  polling: {
    interval: 300,
    autoStart: true,
    params: { timeout: 50 }
  },
  request: {
    timeout: 60000
  }
});

const WELCOME =
  'PositionHire LinkedIn bot 👋\n\n' +
  'Paste a LinkedIn post *share link* and I will post it to positionhire.com ' +
  '(it appears in your admin panel LinkedIn Postings list, just like adding it manually).\n\n' +
  'Accepted links:\n' +
  '• https://www.linkedin.com/posts/...\n' +
  '• https://www.linkedin.com/feed/update/urn:li:activity:...\n' +
  '• https://lnkd.in/... (shortened)\n' +
  '• the full <iframe> embed code';

// Only reply to whitelisted users. If the whitelist is empty, tell the user their
// ID so they can add it to ALLOWED_TELEGRAM_USER_IDS (then restart the bot).
function isAuthorized(msg) {
  const userId = msg.from && msg.from.id;
  if (config.allowedUserIds.size === 0) return false;
  return config.allowedUserIds.has(userId);
}

async function handleAuthGate(msg) {
  if (isAuthorized(msg)) return true;

  const userId = msg.from && msg.from.id;
  if (config.allowedUserIds.size === 0) {
    await bot.sendMessage(
      msg.chat.id,
      `🔒 The bot has no allowed users configured yet.\n\n` +
        `Your Telegram user ID is: *${userId}*\n\n` +
        `Add it to ALLOWED_TELEGRAM_USER_IDS in the bot's .env file and restart the bot.`,
      { parse_mode: 'Markdown' }
    );
  } else {
    await bot.sendMessage(
      msg.chat.id,
      `🔒 Sorry, you are not authorized to use this bot. (Your ID: ${userId})`
    );
  }
  return false;
}

bot.onText(/^\/(start|help)\b/, async (msg) => {
  if (!(await handleAuthGate(msg))) return;
  await bot.sendMessage(msg.chat.id, WELCOME, { parse_mode: 'Markdown' });
});

bot.on('message', async (msg) => {
  // Ignore commands (handled above) and non-text messages.
  const text = msg.text || '';
  if (!text || text.startsWith('/')) return;
  if (!(await handleAuthGate(msg))) return;

  const chatId = msg.chat.id;

  const { embedUrl, error } = await normalizeToEmbedUrl(text);
  if (error) {
    const messages = {
      empty: 'Please send a LinkedIn post link.',
      'no-url': "I couldn't find a link in that message. Paste a LinkedIn post share link.",
      'not-linkedin': "That doesn't look like a LinkedIn link. Paste a linkedin.com or lnkd.in post link.",
      unparseable:
        "I found a LinkedIn link but couldn't identify the post. " +
        'Open the post on LinkedIn, use Share → Copy link to post, and paste that.'
    };
    await bot.sendMessage(chatId, `⚠️ ${messages[error] || 'Could not read that link.'}`);
    return;
  }

  const working = await bot.sendMessage(chatId, '⏳ Posting to positionhire.com…');

  try {
    const posting = await createPosting(embedUrl);

    const lines = ['✅ Posted to positionhire.com!'];
    if (posting.authorName) lines.push(`👤 ${posting.authorName}`);
    if (posting.researchCategory) lines.push(`🏷️ ${posting.researchCategory}`);
    if (posting.country) lines.push(`🌍 ${posting.country}`);
    if (Array.isArray(posting.program) && posting.program.length) {
      lines.push(`🎓 ${posting.program.join(', ')}`);
    }
    lines.push('\nIt now appears in your admin panel LinkedIn Postings list.');

    await bot.editMessageText(lines.join('\n'), {
      chat_id: chatId,
      message_id: working.message_id
    });
  } catch (err) {
    await bot.editMessageText(
      `❌ Failed to post: ${err.message}\n\n` +
        (err.status === 400
          ? 'The link may not be a valid public LinkedIn post embed.'
          : 'Check that the website is running and the admin credentials are correct.'),
      { chat_id: chatId, message_id: working.message_id }
    );
  }
});

// Watchdog: tolerate transient network blips, but if polling keeps failing the
// state is likely wedged — exit so PM2 restarts the process from scratch. The
// streak is reset every time we successfully receive an update (see below).
let pollErrorStreak = 0;
const MAX_POLL_ERROR_STREAK = 6;

bot.on('polling_error', (err) => {
  pollErrorStreak += 1;
  console.error(
    `[polling_error #${pollErrorStreak}]`,
    err.code || '',
    (err.message || err || '').toString()
  );
  if (pollErrorStreak >= MAX_POLL_ERROR_STREAK) {
    console.error(
      `Reached ${MAX_POLL_ERROR_STREAK} consecutive polling errors — exiting so PM2 restarts cleanly.`
    );
    process.exit(1);
  }
});

// Any successfully received update means polling is healthy again.
bot.on('message', () => {
  pollErrorStreak = 0;
});

console.log('PositionHire LinkedIn Telegram bot is running (polling).');
console.log(`API base: ${config.siteApiBase}`);
console.log(
  `Authorized users: ${
    config.allowedUserIds.size ? [...config.allowedUserIds].join(', ') : '(none yet — message the bot to get your ID)'
  }`
);
