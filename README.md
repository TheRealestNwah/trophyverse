# Trophyverse

A cross-platform achievement/trophy aggregator — connect your Steam, Xbox, PlayStation, and RetroAchievements accounts and see everything in one place, with a unified score and level modeled on PlayStation's trophy system.

## Concept

- Link accounts from multiple platforms (Steam, Xbox, PSN, RetroAchievements, more later)
- View all achievements/trophies in a single dashboard
- Unified scoring: every achievement is assigned a PSN-style tier (Bronze/Silver/Gold/Platinum)
  - If a game exists on PlayStation, its native trophy tier is authoritative — even for the Steam/Xbox version of the same achievement
  - Otherwise, tier is inferred from global unlock rarity
- Combined score and level across all connected platforms, following a PSN-like leveling curve

## Status

See [ROADMAP.md](ROADMAP.md). Steam, Xbox, and PSN are all fully working end to end (auth, sync, scoring), plus a cross-platform game/achievement matching job and a dashboard to browse it all. RetroAchievements is next.

## Getting started (server)

Requires a local Postgres database and a [Steam Web API key](https://steamcommunity.com/dev/apikey).

```bash
cd server
cp .env.example .env   # fill in DATABASE_URL and STEAM_API_KEY
npm install
npm run db:migrate     # applies db/schema.sql and seeds the level curve
npm run dev
```

Open `http://localhost:3000` — it'll prompt you to sign in with Steam. First login creates your account and links your Steam ID automatically. From the dashboard you can:

- **Sync Steam** — one click, no extra setup.
- **Connect Xbox** — get a personal API key from [xbl.io/dashboard](https://xbl.io/dashboard) (sign in with your Microsoft account there first) and paste it in.
- **Connect PSN** — log into [playstation.com](https://www.playstation.com), then in the same browser visit https://ca.account.sony.com/api/v1/ssocookie and paste the `npsso` value from the JSON it shows. Treat that token like a password — it grants full account access.
- **Find matches** — merges the same game/achievement across platforms into one entry, so your score doesn't double-count. Run it any time after syncing more than one platform. PSN's own trophy tier always wins when a match includes it, since that's the whole point of this project (see [docs/data-model.md](docs/data-model.md)).

API endpoints, if you want to hit them directly:

- `POST /api/steam/sync`, `POST /api/xbox/sync`, `POST /api/psn/sync` — pull each platform's library and unlocks, recompute score
- `POST /api/xbox/connect` (body: `{ apiKey }`), `POST /api/psn/connect` (body: `{ npsso }`) — link an account
- `POST /api/matching/run` — merge matched games/achievements across all connected platforms (also runnable as `npm run match`)
- `GET /api/me/accounts` — which platforms are linked and when each last synced
- `GET /api/me/games` — all your games across every linked platform, with unlock counts and per-tier breakdown
- `GET /api/me/games/:gameId/achievements` — full achievement list for one game
- `GET /api/me/score` — total points, level, and progress to the next level

An achievement's tier is either inherited from PSN directly (`tier_source = 'psn_native'`) or, when no PSN copy exists or hasn't been matched yet, inferred from global unlock rarity (`tier_source = 'rarity_fallback'`). The level curve is defined in `server/src/scoring/levelCurve.ts` and can be retuned by editing it and rerunning `npm run db:seed-levels`.
