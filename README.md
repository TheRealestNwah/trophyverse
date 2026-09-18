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

See [ROADMAP.md](ROADMAP.md). Steam and Xbox are both working end to end: auth, sync, scoring, and a dashboard to browse them. Cross-platform achievement matching is next.

## Getting started (server)

Requires a local Postgres database and a [Steam Web API key](https://steamcommunity.com/dev/apikey).

```bash
cd server
cp .env.example .env   # fill in DATABASE_URL and STEAM_API_KEY
npm install
npm run db:migrate     # applies db/schema.sql and seeds the level curve
npm run dev
```

Open `http://localhost:3000` — it'll prompt you to sign in with Steam or Xbox. First login creates your account and links that platform automatically; once signed in, "Link Xbox"/"Link Steam" attaches the other platform to the same account. From the dashboard you can sync each platform's library (this can take a few minutes for a large one — it's a real API call per game) and browse your games with achievement tiers, unlock rarity, and your overall score/level.

### Xbox setup

Xbox has no simple API key like Steam — it needs an app registered with Microsoft, since achievement data lives behind Xbox Live's own OAuth:

1. Go to [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. Name it anything (e.g. "Trophyverse"). Under **Supported account types**, choose **Personal Microsoft accounts only** — Xbox accounts are consumer accounts, not organizational ones.
3. Add a **Web** platform redirect URI: `http://localhost:3000/auth/xbox/callback` (match your `BASE_URL` if it's different).
4. Copy the **Application (client) ID** from the registration's overview page.
5. Go to **Certificates & secrets** → **New client secret** → copy the secret's **value** immediately (it's only shown once).
6. Put both in `server/.env` as `XBOX_CLIENT_ID` and `XBOX_CLIENT_SECRET`.

Without these two vars set, Steam still works fine — Xbox routes just return a clear error until they're configured.

API endpoints, if you want to hit them directly (swap `steam`/`xbox` as needed):

- `POST /api/steam/sync`, `POST /api/xbox/sync` — pulls owned games and achievement unlocks, recomputes your score
- `GET /api/steam/games`, `GET /api/xbox/games` — your games with unlock counts and per-tier breakdown
- `GET /api/steam/games/:gameId/achievements`, `GET /api/xbox/games/:gameId/achievements` — full achievement list for one game
- `GET /api/me/score` — total points, level, and progress to the next level (combined across every linked platform)

Achievements synced this way get a provisional tier inferred from global unlock rarity (`tier_source = 'rarity_fallback'`) since no cross-platform matching exists yet — see [docs/data-model.md](docs/data-model.md). The level curve itself is defined in `server/src/scoring/levelCurve.ts` and can be retuned by editing it and rerunning `npm run db:seed-levels`.
