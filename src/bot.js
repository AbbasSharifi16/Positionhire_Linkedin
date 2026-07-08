const TelegramBot = require('node-telegram-bot-api');
const { config, assertConfig } = require('./config');
const { normalizeToEmbedUrl } = require('./linkedin');
const { createPosting } = require('./api');

assertConfig();

const bot = new TelegramBot(config.telegramToken, { polling: true });

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

bot.on('polling_error', (err) => {
  console.error('[polling_error]', err.code || '', err.message || err);
});

console.log('PositionHire LinkedIn Telegram bot is running (polling).');
console.log(`API base: ${config.siteApiBase}`);
console.log(
  `Authorized users: ${
    config.allowedUserIds.size ? [...config.allowedUserIds].join(', ') : '(none yet — message the bot to get your ID)'
  }`
);
