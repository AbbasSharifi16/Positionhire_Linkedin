// PM2 config so the bot runs 24/7 and restarts on crash/reboot.
//
//   pm2 start ecosystem.config.js
//   pm2 save && pm2 startup   (to survive server reboots)
//
// This bot needs Node >= 18 (it uses the global fetch API). If the machine's
// default `node` is older, pin an absolute path to a modern node, e.g.
//
//   PM2_NODE_INTERPRETER=/root/.nvm/versions/node/v22.17.0/bin/node \
//     pm2 start ecosystem.config.js
//
// PM2 stores the resolved interpreter in its dump file, so `pm2 save` makes the
// pin survive reboots instead of falling back to whatever `node` is on PATH.
const interpreter = process.env.PM2_NODE_INTERPRETER;

const app = {
  name: 'positionhire-linkedin-bot',
  script: 'src/bot.js',
  cwd: __dirname,
  // fork, not cluster: Telegram allows only ONE long-polling consumer per bot
  // token. Cluster mode could spawn a second poller and both would get
  // "409 Conflict: terminated by other getUpdates request".
  exec_mode: 'fork',
  instances: 1,
  autorestart: true,
  max_restarts: 20,
  restart_delay: 5000,
  watch: false,
  env: {
    NODE_ENV: 'production'
  }
};

if (interpreter) app.interpreter = interpreter;

module.exports = { apps: [app] };
