# osu! IRC Relay

The relay maintains the shared tournament IRC bot connection used by the referee portal.

`POST /make` serializes BanchoBot lobby creation handshakes and deduplicates concurrent requests for the same match.
`POST /send` requires an exact `#mp_<id>` channel. Authenticated `GET /stream` accepts those lobby channels and the
configured webhook channel (`#vietnamese` by default); events remain filtered by exact channel. The portal API only
allows lobby channels through its own stream endpoint.

Production runs `relay.ts` as the PM2 `irc-relay` process. A terminal IRC close or two minutes without registration
causes the process to exit; PM2 restarts it with backoff. `GET /health` returns HTTP 503 while IRC is disconnected.

The PM2 `irc-webhook-bridge` process runs `index.ts` for the `#vietnamese` Discord webhooks. It subscribes to the
relay's local, authenticated event stream instead of opening a second IRC login with the same osu! account. If the
IRC relay restarts, the subscriber reconnects after five seconds. The relay rejoins the webhook channel when the
subscriber connects. Lobby streams close when IRC disconnects and reconnect through the portal when service returns.

Use `pm2 restart irc-relay` for the IRC connection and `pm2 restart irc-webhook-bridge` for the webhook subscriber.
Check `http://127.0.0.1:7000/health` on the VPS for `connected: true`, and `pm2 logs irc-webhook-bridge` for
`Stream connected`. PM2 startup configuration lives in `ecosystem.config.cjs`.

The VPS enables `pm2-ubuntu.service` for boot recovery and saves the process list with `pm2 save`. The former
`irc-relay.service` is disabled so only one process owns the IRC account and port 7000. PM2 logs show socket errors,
retry attempts, and watchdog exits; a relay process exit triggers PM2's exponential restart backoff.
