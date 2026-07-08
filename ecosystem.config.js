// PM2 config so the bot runs 24/7 on the VPS and restarts on crash/reboot.
//   pm2 start ecosystem.config.js
//   pm2 save && pm2 startup   (to survive server reboots)
module.exports = {
  apps: [
    {
      name: 'positionhire-linkedin-bot',
      script: 'src/bot.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      watch: false,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
