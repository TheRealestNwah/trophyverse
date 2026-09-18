-- Trophyverse data model (PostgreSQL)
-- See docs/data-model.md for the reasoning behind these tables.

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Sessions (connect-pg-simple)
-- ---------------------------------------------------------------------------

-- Adapted from connect-pg-simple's own recommended DDL (see its table.sql),
-- with two changes confirmed necessary against a live server, not just
-- assumed from the docs:
--   - dropped `WITH (OIDS=FALSE)` - OIDS were removed in Postgres 12+, and
--     this fails to create at all on modern Postgres with that clause left in.
--   - dropped `DEFERRABLE INITIALLY IMMEDIATE` on the primary key - the
--     library's own session-write query uses `ON CONFLICT (sid) DO UPDATE`,
--     and Postgres rejects a deferrable constraint as an ON CONFLICT arbiter
--     ("ON CONFLICT does not support deferrable unique constraints/exclusion
--     constraints as arbiters"), so every write failed until this came out.
-- Backing sessions with Postgres instead of express-session's default
-- in-memory store means a server restart (or, later, running more than one
-- server instance) doesn't silently log every signed-in user out.
create table session (
    sid    varchar collate "default" not null,
    sess   json not null,
    expire timestamp(6) not null
);

alter table session add constraint session_pkey primary key (sid);

create index idx_session_expire on session (expire);

-- ---------------------------------------------------------------------------
-- Platforms & users
-- ---------------------------------------------------------------------------

create table platforms (
    id                text primary key,          -- 'steam' | 'xbox' | 'psn' | 'retroachievements'
    name              text not null,
    has_native_tiers  boolean not null default false  -- true only for psn today
);

-- Identity comes from whichever platform the user first signs in with
-- (Steam OpenID, etc.) rather than a separate email/password system, so
-- email is optional and username (a platform display name) isn't unique.
create table users (
    id          uuid primary key default uuid_generate_v4(),
    email       text unique,
    username    text not null,
    created_at  timestamptz not null default now()
);

-- One linked account per user per platform. Holds whatever the platform's
-- API needs to pull unlock data (OAuth tokens for Xbox/PSN, a public
-- SteamID64 for Steam, a username for RetroAchievements).
create table user_platform_accounts (
    id                  uuid primary key default uuid_generate_v4(),
    user_id             uuid not null references users(id) on delete cascade,
    platform_id         text not null references platforms(id),
    platform_account_id text not null,   -- steamid64 / xuid / psn account id / RA username
    display_name        text,
    access_token        text,            -- encrypted at rest by the app layer
    refresh_token        text,
    linked_at           timestamptz not null default now(),
    last_synced_at      timestamptz,
    unique (user_id, platform_id),
    unique (platform_id, platform_account_id)
);

-- ---------------------------------------------------------------------------
-- Games: one canonical row per real-world game, linked out to each
-- platform's own copy of it.
-- ---------------------------------------------------------------------------

create table games (
    id               uuid primary key default uuid_generate_v4(),
    title            text not null,
    cover_image_url  text,
    created_at       timestamptz not null default now()
);

create table game_platform_links (
    id                uuid primary key default uuid_generate_v4(),
    game_id           uuid not null references games(id) on delete cascade,
    platform_id       text not null references platforms(id),
    platform_game_id  text not null,   -- steam appid / xbox title id / psn np comm id / RA game id
    platform_title    text not null,   -- raw title as the platform reports it, kept for match debugging
    unique (platform_id, platform_game_id)
);

-- ---------------------------------------------------------------------------
-- Achievements: one canonical row per real-world achievement, linked out to
-- each platform's copy. Scoring lives on the canonical row so a user only
-- gets credit once even if they unlocked it on two platforms.
-- ---------------------------------------------------------------------------

create type trophy_tier as enum ('bronze', 'silver', 'gold', 'platinum');

create type tier_source as enum (
    'psn_native',           -- game has a PSN release; this is its real trophy tier
    'cross_platform_match', -- inherited from a matched PSN trophy on another platform's copy
    'rarity_fallback'       -- no PSN release exists; tier inferred from global unlock rarity
);

create table canonical_achievements (
    id           uuid primary key default uuid_generate_v4(),
    game_id      uuid not null references games(id) on delete cascade,
    name         text not null,
    description  text,
    tier         trophy_tier not null,
    tier_source  tier_source not null,
    points       smallint not null,   -- resolved from tier via tier_points, denormalized for fast scoring
    created_at   timestamptz not null default now()
);

create table achievement_platform_links (
    id                      uuid primary key default uuid_generate_v4(),
    canonical_achievement_id uuid not null references canonical_achievements(id) on delete cascade,
    platform_id             text not null references platforms(id),
    -- Platform achievement IDs (e.g. Steam API names like "ACH_WIN_ONE_GAME")
    -- are only unique within one game, not globally, so uniqueness must be
    -- scoped by the platform's own game ID too.
    platform_game_id        text not null,
    platform_achievement_id text not null,
    platform_name           text not null,
    platform_description    text,
    global_unlock_rarity    numeric(5,2),   -- percent of players who have this; drives rarity_fallback tiering
    match_confidence        numeric(3,2),   -- 0-1, null when native or manually confirmed
    unique (platform_id, platform_game_id, platform_achievement_id)
);

-- Achievements a matching pass has proposed linking together, awaiting
-- confirmation before they're merged into one canonical_achievements row.
create type match_status as enum ('pending', 'confirmed', 'rejected');

create table achievement_match_candidates (
    id                          uuid primary key default uuid_generate_v4(),
    achievement_platform_link_id uuid not null references achievement_platform_links(id) on delete cascade,
    candidate_canonical_achievement_id uuid not null references canonical_achievements(id) on delete cascade,
    confidence                  numeric(3,2) not null,
    status                      match_status not null default 'pending',
    reviewed_at                 timestamptz
);

-- ---------------------------------------------------------------------------
-- Unlocks & scoring
-- ---------------------------------------------------------------------------

create table user_achievement_unlocks (
    id                          uuid primary key default uuid_generate_v4(),
    user_platform_account_id    uuid not null references user_platform_accounts(id) on delete cascade,
    achievement_platform_link_id uuid not null references achievement_platform_links(id) on delete cascade,
    unlocked_at                 timestamptz not null,
    unique (user_platform_account_id, achievement_platform_link_id)
);

-- games/canonical_achievements are shared, deduplicated tables across every
-- user of the app (that's the point of the canonical model) - so "does this
-- user own this game" can't be inferred from a game merely existing in the
-- canonical tables for a platform they've linked. This records it explicitly,
-- populated during sync for every game the account has (achievements or not).
create table user_owned_games (
    id                       uuid primary key default uuid_generate_v4(),
    user_platform_account_id uuid not null references user_platform_accounts(id) on delete cascade,
    game_id                  uuid not null references games(id) on delete cascade,
    unique (user_platform_account_id, game_id)
);

-- Point value per tier. A table rather than a hardcoded constant so it can
-- be tuned without a migration; seeded with PSN's published values.
create table tier_points (
    tier    trophy_tier primary key,
    points  smallint not null
);

insert into tier_points (tier, points) values
    ('bronze', 15),
    ('silver', 30),
    ('gold', 90),
    ('platinum', 300);

-- Cumulative points required to reach each level, precomputed by the
-- scoring service from a tunable curve (see docs/data-model.md).
create table level_thresholds (
    level           integer primary key,
    points_required bigint not null
);

-- Cached, precomputed per-user totals. Recomputed whenever a new unlock
-- comes in rather than aggregated live on every profile view.
create table user_scores (
    user_id       uuid primary key references users(id) on delete cascade,
    total_points  bigint not null default 0,
    level         integer not null default 1,
    computed_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Seed platforms
-- ---------------------------------------------------------------------------

insert into platforms (id, name, has_native_tiers) values
    ('psn', 'PlayStation Network', true),
    ('steam', 'Steam', false),
    ('xbox', 'Xbox', false),
    ('retroachievements', 'RetroAchievements', false);

-- ---------------------------------------------------------------------------
-- Convenience view: one row per user per canonical achievement they've
-- unlocked on ANY linked platform, deduplicated. This is what the scoring
-- job and profile page should read from.
-- ---------------------------------------------------------------------------

create view user_canonical_unlocks as
select distinct on (upa.user_id, ca.id)
    upa.user_id,
    ca.id as canonical_achievement_id,
    ca.game_id,
    ca.tier,
    ca.points,
    min(uau.unlocked_at) over (partition by upa.user_id, ca.id) as first_unlocked_at
from user_achievement_unlocks uau
join user_platform_accounts upa on upa.id = uau.user_platform_account_id
join achievement_platform_links apl on apl.id = uau.achievement_platform_link_id
join canonical_achievements ca on ca.id = apl.canonical_achievement_id;
