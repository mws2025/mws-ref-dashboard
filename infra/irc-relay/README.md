# osu! IRC Relay

The relay maintains the shared tournament IRC bot connection used by the referee portal.

`POST /make` serializes BanchoBot lobby creation handshakes and deduplicates concurrent requests for the same match.
`POST /send` requires an exact `#mp_<id>` channel. Authenticated `GET /stream` accepts those lobby channels and the
configured webhook channel (`#vietnamese` by default); events remain filtered by exact channel. The portal API only
allows lobby channels through its own stream endpoint.

Production runs this file as `irc-relay.service` from `/home/ubuntu/irc-relay/relay.ts`.

The PM2 `irc-relay` process runs `index.ts` for the `#vietnamese` Discord webhooks. It subscribes to the systemd
relay's local, authenticated event stream instead of opening a second IRC login with the same osu! account. PM2
restarts reconnect the stream automatically; if the systemd relay restarts, the PM2 subscriber retries every five
seconds. The systemd relay joins the webhook channel when the subscriber connects.

Use `pm2 restart irc-relay` for the webhook subscriber and `sudo systemctl restart irc-relay` for the IRC connection.
Check `http://127.0.0.1:7000/health` on the VPS for `connected: true`; PM2 logs should show `Stream connected`.
