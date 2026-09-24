# Build roadmap

## Next up

Every item in the previous "Next up" backlog (#18 through #32) has shipped, along with the 1.0 hardening work (#107 through #119). What remains is getting 1.0 out the door:

1. **Make `db:migrate` safe to re-run on an existing database.** `db/schema.sql` is all plain `create table`, so re-running it against an already-migrated database fails on the first statement (`relation "session" already exists`). `docs/operations.md` and the release checklist both tell operators to run it on every deploy, so the documented upgrade path doesn't work yet. Needs either an idempotent schema or a real migrations table.
2. **Run the live parts of the [1.0 release checklist](docs/release-checklist.md)** - real platform logins, second-sync duplicate checks, disconnect/reconnect, restart survival - then tag once approved.
3. **Live-verify GOG** against a real account. The client follows the community API docs but hasn't been checked against a real library yet (see #31).
4. **Add a Content-Security-Policy.** Helmet's CSP is currently off because the dashboard uses inline scripts; it needs a nonce-based template pass first (see `server/src/index.ts`).

Working discipline for unmonitored runs is unchanged: one focused PR per item, `npx tsc --noEmit` before every commit, live-verify against the real dev DB before merging where possible, and say plainly in the PR when a third-party API assumption couldn't be checked live. Check real API responses with `curl` rather than guessing from docs. File a new issue instead of building anything not listed here that comes up along the way.

## P0 — core (nothing works end-to-end without these)

| # | Component | Status | What it does |
|---|---|---|---|
| 1 | **User auth** | ✅ Done | Steam OpenID login is the identity system (no separate email/password). Sessions persisted in Postgres via `connect-pg-simple` so restarts don't log users out. |
| 2 | **Steam client** | ✅ Done | Pulls owned games + achievement unlocks via Steam's public API. |
| 3 | **Game matching job** | ✅ Done | Links each platform's game ID to one canonical `games` row (exact normalized-title matching). |
| 4 | **Achievement matching job** | ✅ Done | Word-overlap fuzzy match to a canonical row per game; auto-merges at confidence 1.0, queues 0.5–0.99 in `achievement_match_candidates`. A dashboard "Review matches" panel lets you confirm/reject queued candidates by hand. |
| 5 | **Scoring engine** | ✅ Done | Resolves tier (native/cross-match/rarity fallback, capped at gold) → points → level via `tier_points`/`level_thresholds`; recomputes `user_scores` on new unlocks. Sums *every* unlock across every linked platform — re-earning the same achievement on a second platform (a second platinum, a second 100%) counts again rather than being deduped. The level curve's exponent is fit against a real PSN account's level/points (see `server/src/scoring/levelCurve.ts`) rather than guessed — an earlier guess was off by ~3 orders of magnitude at high levels. |
| 6 | **Sync pipeline** | ✅ Done | Orchestrates 2–5 for a linked account: fetch unlocks, upsert games/achievements, run matching, trigger scoring. |
| 7 | **Backend API** | ✅ Done | Serves a user's unified profile (accounts, games, achievements, score, matching) — see README for the endpoint list. |
| 8 | **Dashboard UI** | ✅ Done | Combined per-game rows across platforms; expanding a game groups its achievement list by platform so multiple platinums/100%s on the same game each show up distinctly, with PSN's tier borrowed in either group. |

## P1 — platform expansion

| # | Component | Status | What it does |
|---|---|---|---|
| 9 | **Xbox client** | ✅ Done | OpenXBL-based OAuth + achievement pull (raw Microsoft OAuth was passed over — see PR history). Includes a merge of the modern and legacy (x360) achievement endpoints, since the modern one returns nothing for legacy titles. |
| 10 | **RetroAchievements client** | ✅ Done | Public API, no OAuth key exchange (a personal Web API key + username, same personal-key pattern as Xbox). No native tiers (`has_native_tiers = false`), so achievements are tiered from global unlock rarity like Steam/Xbox, using `NumDistinctPlayersCasual` as the rarity denominator. |
| 11 | **PSN client** | ✅ Done | Unofficial API (NPSSO token → OAuth exchange), implemented directly on Node's `https` module (Node's `fetch`/undici had a confirmed incompatibility with OpenXBL and was avoided here too). This is the scoring source of truth — its native trophy tier always wins when a match includes it. |
| 11b | **GOG client** | 🟡 Built, not live-verified | Unofficial API following the community gogapidocs (paste-the-redirect-code login, since there's no callback we control). Ubisoft Connect and Epic were researched under [#31](https://github.com/TheRealestNwah/unified-achievement-manager/issues/31) and not built. |

## P2 — polish & scale

| # | Component | Status | What it does |
|---|---|---|---|
| 12 | **Background job scheduler** | ✅ Done | Periodic re-sync of every linked account (`server/src/scheduler.ts`), off by default (`SCHEDULER_ENABLED`/`SCHEDULER_INTERVAL_MINUTES`). One account's sync failing (expired PSN token, revoked key) is logged and skipped rather than aborting the run. Runs matching + rescores everyone once per pass if anything synced. |
| 13 | **Rate-limit/caching layer** | ✅ Done | Steam's global achievement percentages are cached per appid for 24 hours (`steam_global_rarity_cache`), and Steam sync skips games whose playtime and last-played time haven't changed. Xbox sync retries transient 429s with backoff. Inbound API and auth routes are rate-limited (`RATE_LIMIT_*`). |
| 14 | **Public shareable profiles** | ✅ Done | Opt-in, off by default (`users.is_public`/`public_slug`, `server/src/public/routes.ts`). A `public_slug` is generated once at signup for every user regardless of opt-in status, but is only ever reachable once `is_public` is toggled on from the dashboard - no requireAuth on these routes at all, the only ones in the app reachable with no account. |
| 15 | **Leaderboards / friend comparison** | ✅ Done | Global leaderboard (`GET /api/public/leaderboard`, `/leaderboard` page) ranks only opted-in public profiles by total points, same privacy gate as item 14. Side-by-side comparison of two public profiles at `/compare?a=<slug>&b=<slug>` ([#28](https://github.com/TheRealestNwah/unified-achievement-manager/issues/28)), with no separate friends model. |
| 16 | **Per-game relative rarity tiering** | ✅ Done | Fixed global rarity thresholds (e.g. <15% = gold) don't adapt to games with atypical achievement distributions — e.g. Payday 2 had 1254 of 1342 achievements land in "gold". Fixed with a hybrid: games stay on fixed thresholds by default, but ones where >50% of achievements would land in gold get re-tiered by rank within their own achievement list instead. See [#10](https://github.com/TheRealestNwah/unified-achievement-manager/issues/10) and `server/src/scoring/rarityNormalization.ts`. |
| 17 | **Manual game linking** | ✅ Done | Automatic game matching only merges on exact normalized title (see item 3), which misses genuine same-game cases formatted differently per platform (e.g. "Skyrim" on PSN vs "The Elder Scrolls V: Skyrim" on Steam). "Link games" mode in the dashboard lets a user pick two of their own library entries to merge; re-runs achievement matching + rarity normalization scoped to just that game, not the whole library. `POST /api/matching/games/merge`. |
| 18 | **Platform-name label overflow bug** | ✅ Done | `.platform-name` now sizes to its content instead of a fixed 70px width. See [#18](https://github.com/TheRealestNwah/unified-achievement-manager/issues/18). |
| 19 | **Per-console platform breakdown** | ✅ Done | Display-only console-variant badges (PS3/PS4/PS5, Xbox 360/One/Series) from each platform's own per-title metadata, without changing the single-login account/sync model. Xbox badges are only shown where OpenXBL can actually confirm the console. See [#19](https://github.com/TheRealestNwah/unified-achievement-manager/issues/19). |

## Parked

- **EA/Origin** — no public API, no realistic path without violating ToS. Revisit only if a reliable third-party data source turns up.
- **Ubisoft Connect** — no public achievements API; the only known auth path takes the user's raw email and password. See [#31](https://github.com/TheRealestNwah/unified-achievement-manager/issues/31).
- **Epic Games Store** — achievements need per-game developer credentials, and most titles have none. See [#31](https://github.com/TheRealestNwah/unified-achievement-manager/issues/31).

## Suggested order

~~Auth → Steam client → game matching → achievement matching → scoring engine → sync pipeline → API → dashboard → Xbox → RetroAchievements → PSN → everything else.~~ Every P0/P1/P2 item is done apart from live-verifying GOG. See "Next up" at the top for what's left before 1.0.
