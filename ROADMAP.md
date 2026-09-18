# Build roadmap

## P0 — core (nothing works end-to-end without these)

| # | Component | What it does |
|---|---|---|
| 1 | **User auth** | Account creation/login. Everything else hangs off a `user_id`. |
| 2 | **Steam client** | Pull owned games + achievement unlocks via Steam's public API. No OAuth needed — start here, it's the easiest real data source. |
| 3 | **Game matching job** | Link each platform's game ID to one canonical `games` row (title/IGDB-based). Required before achievement matching can work. |
| 4 | **Achievement matching job** | Fuzzy-match achievements to a canonical row per game; write low-confidence matches to `achievement_match_candidates` for review. |
| 5 | **Scoring engine** | Resolve tier (native/cross-match/rarity fallback) → points → level via `tier_points`/`level_thresholds`; recompute `user_scores` on new unlocks. |
| 6 | **Sync pipeline** | Orchestrates 2–5 for a linked account: fetch unlocks, upsert games/achievements, run matching, trigger scoring. |
| 7 | **Backend API** | Serves a user's unified profile (games, unlocks, score, level) to a frontend. |
| 8 | **Dashboard UI** | The actual "one place to see everything" screen — this is the product's reason to exist, and the only way to see if the scoring model *feels* right. |

Ship 1–8 with Steam only first. It proves the whole pipeline (matching, scoring, sync, UI) before you touch a second, harder platform.

## P1 — platform expansion

| # | Component | What it does |
|---|---|---|
| 9 | **Xbox client** | OAuth + achievement pull (via OpenXBL or MS APIs). Second platform — validates cross-platform matching actually works, since Xbox has real overlap with Steam's catalog. |
| 10 | **RetroAchievements client** | Public API, no OAuth. Cheap to add, low priority for users but low cost too. |
| 11 | **PSN client** | Unofficial API + OAuth token capture from the user. Highest value (it's the scoring source of truth) but most fragile — do it once matching/scoring already work against a known-good platform, so bugs are easier to isolate. |

## P2 — polish & scale

| # | Component | What it does |
|---|---|---|
| 12 | **Background job scheduler** | Periodic re-sync per user instead of manual/on-demand only. |
| 13 | **Rate-limit/caching layer** | Needed once real users hit Steam/Xbox/PSN APIs regularly. |
| 14 | **Public shareable profiles** | PSNProfiles-style public page per user. |
| 15 | **Leaderboards / friend comparison** | Social layer once solo profiles work. |

## Parked

- **EA/Origin** — no public API, no realistic path without violating ToS. Revisit only if a reliable third-party data source turns up.

## Suggested order

Auth → Steam client → game matching → achievement matching → scoring engine → sync pipeline → API → dashboard → Xbox → RetroAchievements → PSN → everything else.
