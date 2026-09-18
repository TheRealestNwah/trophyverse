# Data model

Schema lives in [`db/schema.sql`](../db/schema.sql). This doc explains the reasoning.

## Core idea

Every real-world game and achievement gets exactly one **canonical** row, no matter how many platforms it appears on. Platform-specific data hangs off that canonical row through a link table. This is what makes cross-platform scoring and deduplication possible.

```
games ---------------< game_platform_links >--------------- platforms
  |
  v
canonical_achievements ---< achievement_platform_links >--- platforms
                                      |
                                      v
                          user_achievement_unlocks
                                      |
                                      v
                          user_platform_accounts ---< users
```

## Why canonical + link tables, not one flat table

If a user owns *Hades* on both Steam and PSN and unlocks "Escape" on both, that must count as **one** achievement toward their score, not two. Storing achievements per-platform with a link back to a shared canonical row makes dedup a join instead of app-level logic scattered everywhere.

## Scoring fields live on `canonical_achievements`

- `tier` — bronze/silver/gold/platinum, PSN-style
- `tier_source` — records *why* it has that tier:
  - `psn_native`: the game has a real PSN release; this is its actual trophy tier
  - `cross_platform_match`: no PSN copy of *this* achievement, but it was matched to one that has a tier
  - `rarity_fallback`: no PSN release exists at all; tier inferred from `global_unlock_rarity` on `achievement_platform_links`
- `points` — denormalized from `tier_points` at resolution time, so scoring never needs a join at read time

Keeping `tier_source` explicit means you can always answer "why does this achievement have this score" and re-run matching later without losing track of which tiers were authoritative vs. guessed.

## Matching is a queue, not a black box

`achievement_match_candidates` holds proposed links between a platform achievement and a canonical achievement, with a `confidence` score and `pending/confirmed/rejected` status. High-confidence matches (e.g. identical name + description) can auto-confirm; low-confidence ones sit for manual review. This keeps the fuzzy-matching algorithm's mistakes correctable without re-scraping anything.

## Scoring is cached, not computed live

`user_scores` holds each user's current `total_points` and `level`, recomputed by a job whenever new unlocks come in. The `user_canonical_unlocks` view does the dedup join (a user's unlock counts once even if earned on two platforms) and is what that job reads from — profile pages read the cache, not the view, so viewing a profile stays cheap.

## Level curve

`level_thresholds` stores precomputed `(level, points_required)` pairs rather than a formula evaluated at query time, so the curve can be regenerated or tuned (e.g. `points_required(L) = round(A * L^p)`) without touching application code — see the earlier design discussion for why PSN's own curve can't be replicated exactly and this approximates its shape instead.

## Not yet modeled

- Game matching automation (title/IGDB-based) — `game_platform_links` assumes rows are populated by a separate matching job, not designed here yet.
- Auth/session tables — out of scope for the data model, belongs with whatever auth approach is chosen later.
