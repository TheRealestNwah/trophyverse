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

See [ROADMAP.md](ROADMAP.md). Steam is fully working end to end: auth, sync, scoring, and a dashboard to browse it. Other platforms and cross-platform matching are next.

## Getting started (server)

Requires a local Postgres database and a [Steam Web API key](https://steamcommunity.com/dev/apikey).

```bash
cd server
cp .env.example .env   # fill in DATABASE_URL and STEAM_API_KEY
npm install
npm run db:migrate     # applies db/schema.sql and seeds the level curve
npm run dev
```

Open `http://localhost:3000` — it'll prompt you to sign in with Steam. First login creates your account and links your Steam ID automatically. From the dashboard you can sync your library (this can take a few minutes for a large one — it's a real API call per game) and browse your games with achievement tiers, unlock rarity, and your overall score/level.

API endpoints, if you want to hit them directly:

- `POST /api/steam/sync` — pulls your owned games and achievement unlocks from Steam, recomputes your score
- `GET /api/steam/games` — your games with unlock counts and per-tier breakdown
- `GET /api/steam/games/:gameId/achievements` — full achievement list for one game
- `GET /api/me/score` — total points, level, and progress to the next level

Achievements synced this way get a provisional tier inferred from global unlock rarity (`tier_source = 'rarity_fallback'`) since no cross-platform matching exists yet — see [docs/data-model.md](docs/data-model.md). The level curve itself is defined in `server/src/scoring/levelCurve.ts` and can be retuned by editing it and rerunning `npm run db:seed-levels`.
