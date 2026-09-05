# osu! IRC Relay

The relay maintains the shared tournament IRC bot connection used by the referee portal.

`POST /make` serializes BanchoBot lobby creation handshakes. `GET /stream` and `POST /send` require an exact
`#mp_<id>` channel; the relay never exposes an unfiltered event stream.

Production runs this file as `irc-relay.service` from `/home/ubuntu/irc-relay/relay.ts`.
