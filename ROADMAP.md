# Build roadmap

## P0 — core (nothing works end-to-end without these)

| # | Component | Status | What it does |
|---|---|---|---|
| 1 | **User auth** | ✅ Done | Steam OpenID login is the identity system (no separate email/password). Sessions persisted in Postgres via `connect-pg-simple` so restarts don't log users out. |
| 2 | **Steam client** | ✅ Done | Pulls owned games + achievement unlocks via Steam's public API. |
| 3 | **Game matching job** | ✅ Done | Links each platform's game ID to one canonical `games` row (exact normalized-title matching). |
| 4 | **Achievement matching job** | ✅ Done | Word-overlap fuzzy match to a canonical row per game; auto-merges at confidence 1.0, queues 0.5–0.99 in `achievement_match_candidates`. A dashboard "Review matches" panel lets you confirm/reject queued candidates by hand. |
| 5 | **Scoring engine** | ✅ Done | Resolves tier (native/cross-match/rarity fallback, capped at gold) → points → level via `tier_points`/`level_thresholds`; recomputes `user_scores` on new unlocks. Sums *every* unlock across every linked platform — re-earning the same achievement on a second platform (a second platinum, a second 100%) counts again rather than being deduped. |
| 6 | **Sync pipeline** | ✅ Done | Orchestrates 2–5 for a linked account: fetch unlocks, upsert games/achievements, run matching, trigger scoring. |
| 7 | **Backend API** | ✅ Done | Serves a user's unified profile (accounts, games, achievements, score, matching) — see README for the endpoint list. |
| 8 | **Dashboard UI** | ✅ Done | Combined per-game rows across platforms; expanding a game groups its achievement list by platform so multiple platinums/100%s on the same game each show up distinctly, with PSN's tier borrowed in either group. |

## P1 — platform expansion

| # | Component | Status | What it does |
|---|---|---|---|
| 9 | **Xbox client** | ✅ Done | OpenXBL-based OAuth + achievement pull (raw Microsoft OAuth was passed over — see PR history). Includes a merge of the modern and legacy (x360) achievement endpoints, since the modern one returns nothing for legacy titles. |
| 10 | **RetroAchievements client** | ⬜ Not started | Public API, no OAuth. Next up. |
| 11 | **PSN client** | ✅ Done | Unofficial API (NPSSO token → OAuth exchange), implemented directly on Node's `https` module (Node's `fetch`/undici had a confirmed incompatibility with OpenXBL and was avoided here too). This is the scoring source of truth — its native trophy tier always wins when a match includes it. |

## P2 — polish & scale

| # | Component | Status | What it does |
|---|---|---|---|
| 12 | **Background job scheduler** | ✅ Done | Periodic re-sync of every linked account (`server/src/scheduler.ts`), off by default (`SCHEDULER_ENABLED`/`SCHEDULER_INTERVAL_MINUTES`). One account's sync failing (expired PSN token, revoked key) is logged and skipped rather than aborting the run. Runs matching + rescores everyone once per pass if anything synced. |
| 13 | **Rate-limit/caching layer** | ⬜ Not started | Needed once real users hit Steam/Xbox/PSN APIs regularly. (Xbox sync already has retry-with-backoff for transient 429s.) |
| 14 | **Public shareable profiles** | ✅ Done | Opt-in, off by default (`users.is_public`/`public_slug`, `server/src/public/routes.ts`). A `public_slug` is generated once at signup for every user regardless of opt-in status, but is only ever reachable once `is_public` is toggled on from the dashboard - no requireAuth on these routes at all, the only ones in the app reachable with no account. |
| 15 | **Leaderboards / friend comparison** | ⬜ Not started | Social layer once solo profiles work. |
| 16 | **Per-game relative rarity tiering** | ✅ Done | Fixed global rarity thresholds (e.g. <15% = gold) don't adapt to games with atypical achievement distributions — e.g. Payday 2 had 1254 of 1342 achievements land in "gold". Fixed with a hybrid: games stay on fixed thresholds by default, but ones where >50% of achievements would land in gold get re-tiered by rank within their own achievement list instead. See [#10](https://github.com/TheRealestNwah/trophyverse/issues/10) and `server/src/scoring/rarityNormalization.ts`. |

## Parked

- **EA/Origin** — no public API, no realistic path without violating ToS. Revisit only if a reliable third-party data source turns up.

## Suggested order

~~Auth → Steam client → game matching → achievement matching → scoring engine → sync pipeline → API → dashboard → Xbox → RetroAchievements → PSN → everything else.~~ Everything through PSN (1–9, 11) plus the rarity-tiering fix (16) is done, ahead of the original order (PSN before RetroAchievements) because PSN is the scoring source of truth. Next: RetroAchievements (10), then P2 polish/scale.
