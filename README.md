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

See [ROADMAP.md](ROADMAP.md). Auth and the Steam client are built; everything else is next.

## Getting started (server)

Requires a local Postgres database and a [Steam Web API key](https://steamcommunity.com/dev/apikey).

```bash
cd server
cp .env.example .env   # fill in DATABASE_URL and STEAM_API_KEY
npm install
npm run db:migrate     # applies db/schema.sql
npm run dev
```

Then visit `http://localhost:3000/auth/steam` to sign in. First login creates your account and links your Steam ID automatically. Once signed in:

- `POST /api/steam/sync` — pulls your owned games and achievement unlocks from Steam
- `GET /api/steam/games` — lists your games with achievement/unlock counts

Achievements synced this way get a provisional tier inferred from global unlock rarity (`tier_source = 'rarity_fallback'`) since no cross-platform matching exists yet — see [docs/data-model.md](docs/data-model.md).
