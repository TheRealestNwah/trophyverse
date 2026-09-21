# Unified Achievement Manager

A cross-platform achievement/trophy aggregator — connect your Steam, Xbox, PlayStation, and RetroAchievements accounts and see everything in one place, with a unified score and level modeled on PlayStation's trophy system.

## Concept

- Link accounts from multiple platforms (Steam, Xbox, PSN, RetroAchievements, more later)
- View all achievements/trophies in a single dashboard
- Unified scoring: every achievement is assigned a PSN-style tier (Bronze/Silver/Gold/Platinum)
  - If a game exists on PlayStation, its native trophy tier is authoritative — even for the Steam/Xbox version of the same achievement
  - Otherwise, tier is inferred from global unlock rarity
- Combined score and level across all connected platforms, following a PSN-like leveling curve

## Status

See [ROADMAP.md](ROADMAP.md). Steam, Xbox, PSN, and RetroAchievements are all fully working end to end (auth, sync, scoring), plus a cross-platform game/achievement matching job (with a manual review UI for low-confidence matches) and a dashboard to browse it all, grouped per platform so multiple platinums/100%s on the same game each show up. Every planned platform integration is now in — remaining work is P2 polish (background sync, leaderboards, public profiles).

## Getting started (server)

Requires a local Postgres database and a [Steam Web API key](https://steamcommunity.com/dev/apikey). By default every platform syncs on demand only (click Sync); set `SCHEDULER_ENABLED=true` in `.env` to also re-sync every linked account automatically on an interval (`SCHEDULER_INTERVAL_MINUTES`, default 360).

```bash
cd server
cp .env.example .env   # fill in the database, platform, session, and encryption settings
npm install
npm run db:migrate     # applies db/schema.sql and seeds the level curve
npm run dev
```

Open `http://localhost:3000` — it'll prompt you to sign in with Steam. First login creates your account and links your Steam ID automatically. From the dashboard you can:

- **Sync Steam** — one click, no extra setup.
- **Connect Xbox** — get a personal API key from [xbl.io/dashboard](https://xbl.io/dashboard) (sign in with your Microsoft account there first) and paste it in.
- **Connect PSN** — log into [playstation.com](https://www.playstation.com), then in the same browser visit https://ca.account.sony.com/api/v1/ssocookie and paste the `npsso` value from the JSON it shows. Treat that token like a password — it grants full account access.
- **Connect RetroAchievements** — get a personal Web API key from your [account settings page](https://retroachievements.org/settings) and paste it in along with your username.
- **Disconnect** — Xbox, PSN, and RetroAchievements can each be unlinked; this removes that platform's synced games/achievements from your library and recomputes your score. Steam can't be disconnected since it's how you sign in.
- **Find matches** — links the same real-world game/achievement across platforms so they share one tier, PSN's own trophy tier always winning when a match includes it (see [docs/data-model.md](docs/data-model.md)). This does **not** collapse your score — unlocking the same achievement on two platforms (e.g. two separate platinums) still counts both. Run it any time after syncing more than one platform.
- **Review matches** — high-confidence matches auto-merge, but anything uncertain queues up here for you to confirm or reject by hand instead of guessing wrong.
- **Link games** — automatic game matching only merges on exact title, which misses genuine same-game cases formatted differently per platform (e.g. "Skyrim" on PSN vs "The Elder Scrolls V: Skyrim" on Steam). Click **Link games**, then click the game whose title you want to keep, then the duplicate to merge into it — re-runs achievement matching for just that game afterward. A filter box above the games list helps find entries in a large library.
- **Public profile** — off by default. Turning it on publishes a PSNProfiles-style read-only page at `/u/<your-slug>` (no login required to view) showing your combined score, level, and full game/achievement list. Turning it back off takes it down immediately.
- **Leaderboard** — `/leaderboard` ranks every opted-in public profile by total points. Private profiles never appear here, same as everywhere else.

API endpoints, if you want to hit them directly:

- `POST /api/steam/sync`, `POST /api/xbox/sync`, `POST /api/psn/sync`, `POST /api/retro/sync` — pull each platform's library and unlocks, recompute score
- `POST /api/xbox/connect` (body: `{ apiKey }`), `POST /api/psn/connect` (body: `{ npsso }`), `POST /api/retro/connect` (body: `{ username, apiKey }`) — link an account
- `POST /api/matching/run` — link matched games/achievements across all connected platforms (also runnable as `npm run match`)
- `GET /api/matching/candidates` — pending low-confidence matches awaiting manual review
- `POST /api/matching/candidates/:id/confirm`, `POST /api/matching/candidates/:id/reject` — resolve a pending candidate
- `POST /api/matching/games/merge` (body: `{ keepGameId, mergeGameId }`) — manually merge two of your own library entries automatic matching missed (differently formatted titles across platforms)
- `GET /api/me/accounts` — which platforms are linked and when each last synced
- `DELETE /api/me/accounts/:platformId` — disconnect a linked platform (Steam can't be disconnected - it's the sign-in identity); removes that account's synced games/unlocks and recomputes your score
- `GET /api/me/games` — all your games across every linked platform, combined into one row per game, with unlock counts and per-tier breakdown
- `GET /api/me/games/:gameId/achievements` — full achievement list for one game, one row per `(achievement, platform)` so a matched achievement's separate completions on each platform each show their own unlock status
- `GET /api/me/score` — total points, level, and progress to the next level, summing every unlock on every linked platform (no cross-platform dedup — see [docs/data-model.md](docs/data-model.md))
- `POST /api/me/public-profile` (body: `{ isPublic }`) — turn your public profile on/off
- `GET /api/public/:slug`, `GET /api/public/:slug/games`, `GET /api/public/:slug/games/:gameId/achievements` — the no-login equivalents of the three routes above, gated on that user having opted in
- `GET /api/public/leaderboard` — top 50 opted-in public profiles by total points

An achievement's tier is either inherited from PSN directly (`tier_source = 'psn_native'`) or, when no PSN copy exists or hasn't been matched yet, inferred from global unlock rarity (`tier_source = 'rarity_fallback'`) — capped at gold, since Platinum on real PSN is a one-per-game completion trophy, not a rarity tier. For games with an unusually skewed rarity distribution (most of the list under the global gold threshold, e.g. Payday 2), tiers are instead ranked within that game's own achievement list rather than against the fixed global cutoffs — see [docs/data-model.md](docs/data-model.md). The level curve is defined in `server/src/scoring/levelCurve.ts` and can be retuned by editing it and rerunning `npm run db:seed-levels` followed by `npm run db:rescore-all` (refreshes everyone's cached level against the new thresholds). Sessions are persisted in Postgres (`connect-pg-simple`), so a server restart doesn't log everyone out.
Platform credentials are encrypted at rest with AES-256-GCM. Set a stable, randomly generated `CREDENTIAL_ENCRYPTION_KEY` in every server environment. After upgrading an existing deployment, run `npm run db:encrypt-platform-credentials` from the `server` directory once; the migration is transactional and safe to re-run.

Sessions use `HttpOnly`, `SameSite=Lax` cookies (and `Secure` when `BASE_URL` is HTTPS). State-changing browser requests require the session-bound CSRF token that the dashboard obtains from `/auth/csrf-token`. Helmet security headers and separate API/authentication rate limits are enabled by default; tune their `RATE_LIMIT_*` settings and set `TRUST_PROXY=true` when the server is behind a trusted reverse proxy.

See [docs/operations.md](docs/operations.md) for deployment readiness, graceful shutdown, backup, and recovery procedures.

For the 1.0 handoff, see the [privacy and data-handling notice](docs/privacy.md) and [release checklist](docs/release-checklist.md). The checklist calls out the remaining operator-owned decisions, including account-deletion contact/process, hosting-log retention, and explicit release-tag approval.
