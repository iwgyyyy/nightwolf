# One Night Ultimate Werewolf · Web Edition

A multiplayer web port of *One Night Ultimate Werewolf*, wrapped in a "Moonlit Village" aesthetic. Share a link, gather your friends, and play from desktop / mobile / WeChat built-in browser — no install required.

> 🌐 [中文版 README](../README.md)

![tech stack](https://img.shields.io/badge/Vite-8-646cff) ![tech stack](https://img.shields.io/badge/React-19-61dafb) ![tech stack](https://img.shields.io/badge/TypeScript-6-3178c6) ![tech stack](https://img.shields.io/badge/three.js-r185-000000) ![tech stack](https://img.shields.io/badge/Tailwind-4-06b6d4)

> [!NOTE]
> **In-room voice chat is built in** (self-hosted LiveKit SFU): connects automatically when you enter a room, free discussion at day, force-muted at night. No third-party VoIP needed.
>
> The "close your eyes / werewolves, wake up" narration uses recorded voice lines (falling back to browser TTS when missing). It may be silent on iOS WeChat built-in browser or muted devices — this does not affect gameplay (on-screen role titles guide the flow just the same).

## Highlights

- **Full One Night Ultimate Werewolf ruleset** — 10 roles: Werewolf, Minion, Seer, Robber, Troublemaker, Drunk, Insomniac, Hunter, Tanner, Villager
- **3D round table** — a moonlit village tabletop rendered in real time with three.js; peeks, swaps, and reveals are fully animated in 3D
- **Built-in room voice** — LiveKit SFU architecture (10-player rooms are easy); phase-linked rules — auto-mute at nightfall, auto-unmute at dawn; name tags show live speaking waves / muted badges
- **Voice narration** — recorded "{Role}, wake up / close your eyes" lines; the server sends cues, each device plays locally
- **Server-authoritative** — dealing, night resolution, and vote tallying all run server-side; each client only receives the projection it is allowed to see — F12 won't reveal any cards
- **Admin-gated rooms** — creating a room requires credentials (server-side check + HMAC token); join via a shareable link
- **Disconnect recovery** — WebSocket auto-reconnect; host disconnect pauses the room, reconnect resumes
- **Responsive + PWA** — dedicated desktop and mobile layouts; "Add to Home Screen" supported

## Tech stack

| Layer | Stack |
|-------|-------|
| Build | Vite 8 + Bun |
| UI | React 19 (React Compiler enabled) + Tailwind CSS v4 + shadcn/ui |
| 3D | three.js + @react-three/fiber + drei |
| State | Zustand + Immer |
| Animation | Motion (Framer Motion) + R3F frame loop |
| Routing | React Router v7 (SPA mode) |
| Voice | LiveKit (self-hosted SFU) + coturn (fallback for UDP-restricted networks) |
| Sync | WebSocket, server-authoritative projected state |
| Backend | Bun running TypeScript natively, single Docker container, Caddy for TLS |
| Tests | Vitest (covering the game engine and sync layer) |

## Getting started

### Backend (start first)

```bash
cd server
bun install
cp .env.example .env    # set ADMIN_USERNAME / ADMIN_PASSWORD
bun run dev             # ws://localhost:9000
```

### Frontend

```bash
bun install
cp .env.example .env.local   # VITE_WS_URL=/api, proxied by vite to localhost:9000
bun run dev
```

Defaults to `http://localhost:5173`. The terminal also prints a LAN URL (`http://192.168.x.x:5173`) you can open on your phone.

> Without `LIVEKIT_*` configured, room voice shows as "unavailable" during local development; gameplay is unaffected. See the LiveKit section in [`deploy/README.md`](../deploy/README.md) to wire up voice locally.

### Multiplayer testing

- Same browser: open multiple **incognito windows** against the dev server; each gets its own `playerId`
- Across devices: open the printed `http://192.168.x.x:5173` on a phone on the same WiFi (note: voice requires a secure context, so it is unavailable over plain LAN IPs)
- macOS firewall will prompt to allow Bun to accept inbound connections on first run — click "Allow"

## Project layout

```
shared/                  # shared between client and server
├── engine/              # pure-function game engine (deal/night/vote/win, unit-testable)
├── protocol.ts          # WebSocket message protocol
└── types/

server/                  # server-authoritative game service (Bun)
└── src/
    ├── index.ts         # Bun.serve + message dispatch
    ├── room.ts          # room storage and per-connection projection
    ├── game.ts          # match flow driver
    ├── auth.ts          # admin HMAC tokens + rate limiting
    └── voice.ts         # LiveKit voice credential issuance

src/                     # frontend
├── scene/               # three.js 3D scene (table, cards, seat name tags)
├── services/            # VoiceService (LiveKit) / NarrationService, etc.
├── sync/                # WebSocket client (heartbeat + reconnect)
├── stores/              # Zustand stores
├── hooks/
├── routes/              # home / lobby / game
└── components/          # game components + shadcn/ui primitives

deploy/                  # deployment sources (Caddyfile, docker-compose, LiveKit/coturn samples)
```

## Game flow

```
Waiting → Dealing → Night (n steps) → Day → Voting → Result → Waiting (play again)
```

- **Night wake-ups** follow initial roles (originalRoles); every role in the configured pool is called even if nobody drew it, keeping the pacing constant to prevent information leaks
- **Result reveals** follow final roles (allPlayerRoles, after all night swaps)
- **Voice phase rules**: everyone is force-muted and locked at nightfall; unlocked and auto-unmuted at dawn
- **Host disconnect**: the server sets `isPaused=true`, all clients show a pause overlay; reconnect resumes automatically

## Common commands

```bash
bun run dev       # start the dev server
bun run lint      # ESLint
bun run test      # Vitest
bun run build     # production build (tsc -b + vite build)
bun run preview   # preview the production build
```

## Deployment

Self-hosted on a single server: Caddy terminates TLS, `/` serves the frontend static assets, `/api` proxies to the game service (Docker), `/livekit` proxies the voice SFU signaling; pushing to main triggers a GitHub Actions build and rsync deploy. Full steps in [`deploy/README.md`](../deploy/README.md).

**Constraint**: the game service must run as a single instance (room state lives in process memory); restarts interrupt games in progress.

## Docs

- [`docs/PRD.md`](PRD.md) — product requirements / game rules / network protocol
- [`docs/plans/`](plans/) — implementation notes by phase
- [`server/README.md`](../server/README.md) — server architecture, visibility model, and protocol
- [`deploy/README.md`](../deploy/README.md) — server deployment (Caddy / Docker / LiveKit / coturn / CI)

## License

Personal project.
