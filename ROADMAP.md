# Build roadmap

## Next up (backlog, in priority order)

Everything below is scoped concretely enough to start on without further discussion. Working discipline for unmonitored runs: one focused PR per item, `npx tsc --noEmit` before every commit, live-verify against the real dev DB before merging (not just typecheck) - if live verification of a third-party API assumption isn't possible (no test credentials, etc.), merge anyway only if the fallback/error path is verified, and say so plainly in the PR rather than claiming full verification. Never guess at a third-party API's response shape from docs alone if it can be checked with a real `curl` first (see the RA field-name bug in #13's history). File a new issue instead of building anything not listed here that comes up along the way.

1. **Fix [#18](https://github.com/TheRealestNwah/trophyverse/issues/18)** - `.platform-name`'s fixed 70px width overflows onto the sync-status text for long platform names ("RetroAchievements"). Quick CSS fix (remove the fixed width, let it size to content, add spacing).
2. **[#20](https://github.com/TheRealestNwah/trophyverse/issues/20) Disconnect a linked platform account** - there's Connect and Sync but no way to unlink Xbox/PSN/RetroAchievements. Real functional gap, straightforward once `user_owned_games`/`user_achievement_unlocks` cascade behavior on delete is confirmed live.
3. **[#22](https://github.com/TheRealestNwah/trophyverse/issues/22) Game cover art and achievement icons** - every platform's API already returns image URLs that go completely unused; biggest single thing separating the dashboard from the "PSNProfiles-style" page this project is going for.
4. **[#21](https://github.com/TheRealestNwah/trophyverse/issues/21) Faster Steam sync** (incremental, skip unchanged games) - real pain, already visible in the dashboard's own "this can take a few minutes" warning. Verify Steam's `playtime_forever` behavior live before relying on it as the skip signal.
5. **[#27](https://github.com/TheRealestNwah/trophyverse/issues/27) Cache Steam's global achievement percentages** - concrete scope for the vague "rate-limit/caching" item below. `getGlobalAchievementPercentages` (`server/src/steam/client.ts`) is re-fetched per owned game on every single full sync, but global rarity shifts slowly. Cache per-appid with a TTL (a day or so is plenty), especially now that the background scheduler (#12, done) can trigger frequent re-syncs. Related to but distinct from item 4 above - do both.
6. **Research [#19](https://github.com/TheRealestNwah/trophyverse/issues/19)** (console-generation breakdown) - before writing any code, hit PSN's and Xbox's real APIs with `curl` against a live linked account to confirm what per-title generation metadata actually exists (the issue names a candidate PSN field, `trophyTitlePlatform`, that is unverified). If the data is clean, implement the least invasive option identified in the issue (a display-only `console_variant` column on `game_platform_links`, `platform_id` unchanged). If the data is messy or absent, report findings back rather than forcing a bad design.
7. **[#23](https://github.com/TheRealestNwah/trophyverse/issues/23) Recent activity feed** - `unlocked_at` is already tracked; this is a new read query + a panel, no new sync/schema work.
8. **[#24](https://github.com/TheRealestNwah/trophyverse/issues/24) Sort/filter the games list** - completion %, alphabetical, platform grouping. Likely a client-side re-sort of the already-fetched games array.
9. **[#28](https://github.com/TheRealestNwah/trophyverse/issues/28) Side-by-side profile comparison** - concrete scope for the "friend comparison" half of item 15 below. No new "friends" data model needed - public profiles are already shareable by slug (#14, done). A page taking two `?a=slug&b=slug` params and rendering both profiles' scores/games next to each other covers the actual use case without inventing a follow/friend-request system nothing else in the app has.
10. **[#25](https://github.com/TheRealestNwah/trophyverse/issues/25) Fun stats/insights page** - rarest achievement owned, most points in a day, longest platinum drought, etc. Pure novelty, cheap given the data's already there. Good to build alongside item 7.
11. **[#26](https://github.com/TheRealestNwah/trophyverse/issues/26) Data export** - a "download my data" JSON/CSV endpoint scoped to the requesting user's own data.
12. **[#32](https://github.com/TheRealestNwah/trophyverse/issues/32) User-set cover art/icons** (upload or paste a URL) - manual override on top of #22's automatic images, for platforms/cases with no usable image. Needs a storage-approach decision (file upload has no existing infrastructure in this app) before implementation.
13. **Research [#31](https://github.com/TheRealestNwah/trophyverse/issues/31)** (Ubisoft Connect / GOG / Epic integrations) - same discipline as #19: confirm each platform actually has a usable API before committing to any of them. Epic in particular may not be feasible at all (no achievements for most games, no known public API). Scope one platform at a time, not as a single unit.

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

## P2 — polish & scale

| # | Component | Status | What it does |
|---|---|---|---|
| 12 | **Background job scheduler** | ✅ Done | Periodic re-sync of every linked account (`server/src/scheduler.ts`), off by default (`SCHEDULER_ENABLED`/`SCHEDULER_INTERVAL_MINUTES`). One account's sync failing (expired PSN token, revoked key) is logged and skipped rather than aborting the run. Runs matching + rescores everyone once per pass if anything synced. |
| 13 | **Rate-limit/caching layer** | ⬜ Not started | Needed once real users hit Steam/Xbox/PSN APIs regularly. (Xbox sync already has retry-with-backoff for transient 429s.) Scoped concretely as "Next up" item 3 above: cache Steam's global achievement percentages first. |
| 14 | **Public shareable profiles** | ✅ Done | Opt-in, off by default (`users.is_public`/`public_slug`, `server/src/public/routes.ts`). A `public_slug` is generated once at signup for every user regardless of opt-in status, but is only ever reachable once `is_public` is toggled on from the dashboard - no requireAuth on these routes at all, the only ones in the app reachable with no account. |
| 15 | **Leaderboards / friend comparison** | 🟡 Partial | Global leaderboard done (`GET /api/public/leaderboard`, `/leaderboard` page) — ranks only opted-in public profiles by total points, same privacy gate as item 14. Friend-specific comparison not started - scoped concretely as "Next up" item 4 above. |
| 16 | **Per-game relative rarity tiering** | ✅ Done | Fixed global rarity thresholds (e.g. <15% = gold) don't adapt to games with atypical achievement distributions — e.g. Payday 2 had 1254 of 1342 achievements land in "gold". Fixed with a hybrid: games stay on fixed thresholds by default, but ones where >50% of achievements would land in gold get re-tiered by rank within their own achievement list instead. See [#10](https://github.com/TheRealestNwah/trophyverse/issues/10) and `server/src/scoring/rarityNormalization.ts`. |
| 17 | **Manual game linking** | ✅ Done | Automatic game matching only merges on exact normalized title (see item 3), which misses genuine same-game cases formatted differently per platform (e.g. "Skyrim" on PSN vs "The Elder Scrolls V: Skyrim" on Steam). "Link games" mode in the dashboard lets a user pick two of their own library entries to merge; re-runs achievement matching + rarity normalization scoped to just that game, not the whole library. `POST /api/matching/games/merge`. |
| 18 | **Platform-name label overflow bug** | ⬜ Not started | `.platform-name`'s fixed 70px width overflows onto adjacent text for long platform names ("RetroAchievements"). See [#18](https://github.com/TheRealestNwah/trophyverse/issues/18). |
| 19 | **Per-console platform breakdown** | ⬜ Design/research needed | Split PSN into PS3/PS4/PS5 and Xbox into 360/One/Series for display, without changing the underlying single-login account/sync model. See [#19](https://github.com/TheRealestNwah/trophyverse/issues/19) for why this is more involved than it looks and the open design questions - needs live API verification before implementation. |

## Parked

- **EA/Origin** — no public API, no realistic path without violating ToS. Revisit only if a reliable third-party data source turns up.

## Suggested order

~~Auth → Steam client → game matching → achievement matching → scoring engine → sync pipeline → API → dashboard → Xbox → RetroAchievements → PSN → everything else.~~ Every P0/P1 item is done. See "Next up" at the top for the current prioritized backlog (11 items, #18 through #26).
