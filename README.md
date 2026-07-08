# PositionHire LinkedIn Telegram Bot

Paste a LinkedIn post **share link** into Telegram → the post is added to
**positionhire.com** and shows up in your **Admin Panel → LinkedIn Postings**
list, exactly the same as pasting an embed code manually.

## How it works

1. You send the bot a LinkedIn link (share link, `/feed/update/...`, `lnkd.in/...`,
   or a full `<iframe>` embed code).
2. The bot converts it into the canonical embed URL the site expects
   (`https://www.linkedin.com/embed/feed/update/urn:li:activity:<id>`).
3. It logs into your site's admin API and calls the **same** endpoint the admin
   panel uses (`POST /api/admin/linkedin-postings`). The website then fetches the
   post text/author, AI-classifies it (research category, country, program), and
   saves it. **No website code was changed.**

So a post added by the bot is indistinguishable from one you added by hand — it
appears in the public LinkedIn Postings page and in the admin list, filterable and
deletable as usual.

## Setup (on the VPS, same server as the website)

```bash
cd telegram_bot_linkedin_positionhire
npm install
```

Create your bot token: message **@BotFather** on Telegram → `/newbot` → copy the token.

Edit **`.env`**:

```
TELEGRAM_BOT_TOKEN=<token from @BotFather>
ALLOWED_TELEGRAM_USER_IDS=       # leave empty for the first run
SITE_API_BASE=http://localhost:5000/api
ADMIN_USERNAME=<your admin username or email>
ADMIN_PASSWORD=<your admin password>
```

### Get your Telegram user ID (one-time)

```bash
npm start
```

Message the bot anything. It replies with **"Your Telegram user ID is: ..."**.
Put that number into `ALLOWED_TELEGRAM_USER_IDS` in `.env`, then restart.
Now the bot only responds to you.

## Run 24/7 with PM2

```bash
npm install -g pm2       # if not already installed
pm2 start ecosystem.config.js
pm2 save
pm2 startup             # follow the printed command so it survives reboots
```

Useful: `pm2 logs positionhire-linkedin-bot`, `pm2 restart positionhire-linkedin-bot`.

## Usage

In Telegram, just paste any of these and send:

- `https://www.linkedin.com/posts/<name>_..._activity-<id>-xxxx`
- `https://www.linkedin.com/feed/update/urn:li:activity:<id>/`
- `https://lnkd.in/xxxxx` (shortened links are auto-resolved)
- the full `<iframe ...>` embed code

The bot replies with ✅ and the detected author / research category / country /
program once the site has saved it.

## Test the link conversion (no Telegram/site needed)

```bash
npm test
```

## Notes / troubleshooting

- **"not authorized"** → your Telegram ID isn't in `ALLOWED_TELEGRAM_USER_IDS`.
- **"Failed to post (400)"** → the link isn't a valid *public* LinkedIn post
  (private posts can't be embedded). Use the post's **Share → Copy link to post**.
- **"Check that the website is running..."** → the backend on port 5000 isn't
  reachable, or the admin username/password in `.env` is wrong.
- The bot uses **long polling**, so it needs no inbound ports or webhook setup.
- Only the bot's `.env` holds your admin password; keep it out of git (it's in
  `.gitignore`).
