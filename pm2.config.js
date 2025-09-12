module.exports = {
  apps: [{
    name: 'chat-app',
    script: 'npx',
    args: 'wrangler pages dev dist --port 8788',
    cwd: '/home/user/webapp',
    env: {
      NODE_ENV: 'development'
    }
  }]
};
