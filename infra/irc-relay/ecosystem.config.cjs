const cwd = "/home/ubuntu/irc-relay"
const bun = "/home/ubuntu/.bun/bin/bun"

module.exports = {
  apps: [
    {
      name: "irc-relay",
      script: bun,
      args: "run relay.ts",
      interpreter: "none",
      cwd,
      autorestart: true,
      exp_backoff_restart_delay: 5000,
      max_restarts: 1000,
    },
    {
      name: "irc-webhook-bridge",
      script: bun,
      args: "run index.ts",
      interpreter: "none",
      cwd,
      autorestart: true,
      exp_backoff_restart_delay: 5000,
      max_restarts: 1000,
    },
  ],
}
