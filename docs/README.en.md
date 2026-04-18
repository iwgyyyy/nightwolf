# One Night Ultimate Werewolf · Web Edition

A multiplayer web port of *One Night Ultimate Werewolf*, wrapped in a "Moonlit Village" aesthetic. Share a link, gather your friends, and play from desktop / mobile / WeChat built-in browser — no install required.

> 🌐 [中文版 README](../README.md)

![tech stack](https://img.shields.io/badge/Vite-8-646cff) ![tech stack](https://img.shields.io/badge/React-19-61dafb) ![tech stack](https://img.shields.io/badge/TypeScript-6-3178c6) ![tech stack](https://img.shields.io/badge/Tailwind-4-06b6d4)

> [!IMPORTANT]
> **Voice chat between players is NOT included.** Use your own VoIP tool (WeChat voice call, Discord, QQ, Tencent Meeting, etc.) for the daytime discussion phase. This project only handles game state sync and rule enforcement.
>
> The built-in "Everyone close your eyes / Werewolves, wake up" narration uses the browser's native Web Speech API for local playback. It may be silent on **iOS WeChat built-in browser, some Android devices without a Chinese TTS engine, or when the device is muted** — this is a browser limitation and does not affect gameplay (the on-screen role title and table cues guide the flow just the same).

## Highlights

- **Full One Night Ultimate Werewolf ruleset** — 10 roles: Werewolf, Minion, Seer, Robber, Troublemaker, Drunk, Insomniac, Hunter, Tanner, Villager
- **Immersive round-table night phase** — all players seated around the circle; floating + dimming mask while eyes are closed; full animations for swaps and peeks
- **Voice narration** — each device plays "{Role}, wake up / close your eyes" locally via Web Speech API
- **Admin-gated rooms** — creating a room requires credentials; join via a shareable link
- **Cross-device sync** — WebSocket relay keeps state consistent, with automatic reconnect + host-disconnect pause/resume
- **Responsive** — dedicated desktop and mobile layouts; table size and interactions adapt
- **PWA** — "Add to Home Screen" supported

## Tech stack

| Layer | Stack |
|-------|-------|
| Build | Vite 8 + Bun |
| UI | React 19 (React Compiler enabled) + Tailwind CSS v4 + shadcn/ui |
| State | Zustand + Immer + use-immer |
| Animation | Framer Motion + CSS 3D transform |
| Routing | React Router v7 (SPA mode) |
| Forms | react-hook-form + zod + Field |
| Sync | WebSocket (prod) / BroadcastChannel (same-browser multi-tab dev) |
| Backend | Node.js + `ws`, deployed as a CloudBase HTTP Function |
| Tests | Vitest (92 unit tests covering engine + sync) |

## Getting started

### Frontend

```bash
# Install dependencies
bun install

# Copy the env template and fill in admin credentials
cp .env.example .env.local
# Edit .env.local: set VITE_ADMIN_USERNAME / VITE_ADMIN_PASSWORD
# To hook up the local WebSocket relay, also set VITE_WS_URL

# Start the dev server (binds to all interfaces so your phone can reach it over LAN)
bun run dev
```

Defaults to `http://localhost:5173`. The terminal also prints a LAN URL (`http://192.168.x.x:5173`) you can open on your phone.

If `VITE_WS_URL` is not set, the app falls back to `InMemorySyncService` (multi-tab in the same browser; great for solo iteration).

### Backend (WebSocket relay)

In a second terminal:

```bash
cd cloudbase/cloudfunctions/ws-relay
npm install
cp .env.example .env
# Edit .env: ADMIN_USERNAME / ADMIN_PASSWORD must match the frontend
npm run dev
```

Listens on `ws://localhost:9000`. Set `VITE_WS_URL=ws://localhost:9000` in the frontend's `.env.local` (the code auto-rewrites the hostname to whatever host the page was opened from, so phones on the LAN work with no extra config).

### Multiplayer testing

- **Same browser**: open several **private windows** — each has its own `playerId`
- **Across devices**: put phone on the same Wi-Fi and open the LAN URL printed in the terminal
- On macOS, the first run may prompt to allow Node/Bun to accept incoming connections — click "Allow"

## Project layout

```
src/
├── engine/              # Pure-function game engine (fully unit-tested)
│   ├── dealRoles.ts     # Deal cards
│   ├── nightOrder.ts    # Night wake-up order
│   ├── nightActions.ts  # Per-role action handlers
│   ├── voting.ts        # Vote tallying + elimination
│   ├── winJudge.ts      # Win condition
│   └── orchestrator.ts  # Start game / play again
├── sync/                # Sync layer
│   ├── GameSyncService.ts     # Abstract interface
│   ├── InMemorySyncService.ts # Dev-time implementation
│   ├── WebSocketSyncService.ts # Production implementation
│   └── WebSocketConnection.ts  # Heartbeat + reconnect
├── stores/              # Zustand stores
├── hooks/               # Custom hooks
├── services/            # TTS / Identicon / room ID
├── routes/              # Pages
│   ├── home/
│   ├── lobby/
│   └── game/
│       └── components/  # Five-phase sub-screens
├── components/
│   ├── game/            # In-house game UI (Card, PlayerTable, CardSwap, …)
│   ├── ui/              # shadcn/ui primitives
│   └── icons/
└── types/

cloudbase/
└── cloudfunctions/
    └── ws-relay/        # WebSocket relay backend

public/
├── manifest.webmanifest
├── icon.svg
├── icon-192.png
└── icon-512.png
```

## Game flow

```
Waiting → Dealing → Night (n steps) → Day → Voting → Result → Waiting (play again)
```

- **Night wake-up** is driven by *original* roles (`originalRoles`): every role that was added to the role pool gets its step called, even if it ended up in the center pile — this keeps the rhythm consistent so players can't infer who drew what from which calls happen or not.
- **Result reveal** uses *final* roles (`allPlayerRoles` after every swap).
- **Host disconnect**: the backend sets `isPaused=true` and all clients show the pause overlay; the host's reconnect automatically clears it.
- **Host refresh**: on re-mount, the orchestrator inspects `phaseEndsAt` and restores the corresponding phase timer.

## Common scripts

```bash
bun run dev       # dev server
bun run lint      # ESLint
bun run test      # Vitest
bun run build     # production build
bun run preview   # preview the production build locally
```

## Deployment

- **Frontend**: `bun run build`, then upload `dist/` to CloudBase Static Hosting (or Vercel, Netlify, etc.)
- **Backend**: see `cloudbase/cloudfunctions/ws-relay/README.md`. Deploy as a CloudBase HTTP Function with WS protocol, single-instance (MinNum = MaxNum = 1, because room state lives in-memory).
- In production, configure `VITE_WS_URL=wss://...` on the build platform and set `ADMIN_USERNAME` / `ADMIN_PASSWORD` as environment variables on the relay function.

## Docs

- [`docs/PRD.md`](PRD.md) — product spec, game rules, network protocol
- [`docs/plans/`](plans/) — implementation-phase notes
- [`cloudbase/cloudfunctions/ws-relay/README.md`](../cloudbase/cloudfunctions/ws-relay/README.md) — backend protocol and deployment

## License

Personal project.
