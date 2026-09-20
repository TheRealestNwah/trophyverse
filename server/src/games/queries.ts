import { pool } from "../db";

// Shared by the authenticated /api/me/games routes and the public,
// no-login profile routes (server/src/public/routes.ts) - same data, same
// shape, just keyed by whichever user_id the caller already resolved
// (a signed-in user's own id, or the owner of a public profile slug).

export async function getGamesForUser(userId: string) {
    const result = await pool.query(
        `select
            g.id,
            g.title,
            -- A user's own pasted cover art (see #32) wins over the
            -- auto-detected one on games.cover_image_url - scoped to
            -- whichever user_id the caller resolved, so this works
            -- unmodified for both the authenticated and public-profile
            -- routes (a public profile shows its owner's own override).
            coalesce(
                (select cover_image_url from user_game_cover_overrides where user_id = $1 and game_id = g.id),
                g.cover_image_url
            ) as cover_image_url,
            (select array_agg(distinct platform_id) from game_platform_links where game_id = g.id) as platforms,
            -- Display-only console-generation tags per platform link (e.g.
            -- {"psn": "PS5"}) - see #19. Only ever populated where the
            -- source platform's API gives clean per-title data. A platform
            -- can have more than one game_platform_links row for the same
            -- game (e.g. separate PS3 and PS4 trophy lists for a cross-gen
            -- title, correctly merged into one game by matchGames) - see
            -- #75, so this combines every distinct variant per platform
            -- rather than collapsing to whichever row jsonb_object_agg
            -- happens to keep on a duplicate key.
            (select jsonb_object_agg(platform_id, variants) from (
                select platform_id, string_agg(distinct console_variant, ', ' order by console_variant) as variants
                from game_platform_links
                where game_id = g.id and console_variant is not null
                group by platform_id
            ) grouped) as console_variants,
            count(ca.id) as total_achievements,
            count(uau.id) as unlocked_achievements,
            coalesce(sum(ca.points) filter (where uau.id is not null), 0) as points_earned,
            count(*) filter (where ca.tier = 'platinum' and uau.id is not null) as platinum_unlocked,
            count(*) filter (where ca.tier = 'gold' and uau.id is not null) as gold_unlocked,
            count(*) filter (where ca.tier = 'silver' and uau.id is not null) as silver_unlocked,
            count(*) filter (where ca.tier = 'bronze' and uau.id is not null) as bronze_unlocked
         from games g
         join canonical_achievements ca on ca.game_id = g.id
         left join achievement_platform_links apl on apl.canonical_achievement_id = ca.id
         left join user_achievement_unlocks uau
                on uau.achievement_platform_link_id = apl.id
               and uau.user_platform_account_id in (
                   select id from user_platform_accounts where user_id = $1
               )
         -- Ownership is a pure filter here, not a join source - see
         -- games/routes.ts history for why joining user_owned_games
         -- directly fanned every count out once per owning platform account.
         where exists (
             select 1 from user_owned_games uog
             join user_platform_accounts upa on upa.id = uog.user_platform_account_id
             where upa.user_id = $1 and uog.game_id = g.id
         )
         group by g.id, g.title, g.cover_image_url
         order by unlocked_achievements desc, g.title`,
        [userId]
    );
    return result.rows;
}

export async function getRecentActivity(userId: string, limit = 20) {
    const result = await pool.query(
        `select
            ca.name, ca.tier, ca.points, ca.icon_url,
            g.id as game_id, g.title as game_title,
            apl.platform_id, uau.unlocked_at
         from user_achievement_unlocks uau
         join user_platform_accounts upa on upa.id = uau.user_platform_account_id
         join achievement_platform_links apl on apl.id = uau.achievement_platform_link_id
         join canonical_achievements ca on ca.id = apl.canonical_achievement_id
         join games g on g.id = ca.game_id
         where upa.user_id = $1
         order by uau.unlocked_at desc
         limit $2`,
        [userId, limit]
    );
    return result.rows;
}

// Novelty stats in the spirit of PSNProfiles/TrueAchievements "fun facts" -
// see #25. All read-only aggregates over data already tracked, no new
// sync/schema work.
// Excludes a known bad-data case, not the true earliest possible platform
// date: some legacy Xbox 360 unlocks come back from OpenXBL with a bogus
// sentinel timestamp (seen: 1752-12-31, centuries before Xbox existed, and
// shared identically across 87 unlocks - enough to fake out "busiest day"
// stats too) instead of a real unlock time - see #41 for the root cause.
// 2000-01-01 predates every platform's first real achievement by years, so
// it only ever excludes garbage, never a real early unlock.
const UNLOCK_TIMESTAMP_FLOOR = "2000-01-01";

export async function getFunStats(userId: string) {
    const rarest = await pool.query(
        `select ca.name, g.title as game_title, apl.platform_id, apl.global_unlock_rarity
         from user_achievement_unlocks uau
         join user_platform_accounts upa on upa.id = uau.user_platform_account_id
         join achievement_platform_links apl on apl.id = uau.achievement_platform_link_id
         join canonical_achievements ca on ca.id = apl.canonical_achievement_id
         join games g on g.id = ca.game_id
         where upa.user_id = $1 and apl.global_unlock_rarity is not null
         order by apl.global_unlock_rarity asc
         limit 1`,
        [userId]
    );

    const busiestPointsDay = await pool.query(
        `select date(uau.unlocked_at) as day, sum(ca.points) as points
         from user_achievement_unlocks uau
         join user_platform_accounts upa on upa.id = uau.user_platform_account_id
         join achievement_platform_links apl on apl.id = uau.achievement_platform_link_id
         join canonical_achievements ca on ca.id = apl.canonical_achievement_id
         where upa.user_id = $1 and uau.unlocked_at > $2
         group by day
         order by points desc
         limit 1`,
        [userId, UNLOCK_TIMESTAMP_FLOOR]
    );

    const busiestUnlockDay = await pool.query(
        `select date(uau.unlocked_at) as day, count(*) as unlocks
         from user_achievement_unlocks uau
         join user_platform_accounts upa on upa.id = uau.user_platform_account_id
         where upa.user_id = $1 and uau.unlocked_at > $2
         group by day
         order by unlocks desc
         limit 1`,
        [userId, UNLOCK_TIMESTAMP_FLOOR]
    );

    const oldest = await pool.query(
        `select ca.name, g.title as game_title, apl.platform_id, uau.unlocked_at
         from user_achievement_unlocks uau
         join user_platform_accounts upa on upa.id = uau.user_platform_account_id
         join achievement_platform_links apl on apl.id = uau.achievement_platform_link_id
         join canonical_achievements ca on ca.id = apl.canonical_achievement_id
         join games g on g.id = ca.game_id
         where upa.user_id = $1 and uau.unlocked_at > $2
         order by uau.unlocked_at asc
         limit 1`,
        [userId, UNLOCK_TIMESTAMP_FLOOR]
    );

    // Platinum only ever comes from a real PSN trophy (see scoring/tier.ts) -
    // the only tier where "completed everything else in the game" is a real,
    // native signal rather than an inferred rarity guess.
    const platinums = await pool.query(
        `select uau.unlocked_at
         from user_achievement_unlocks uau
         join user_platform_accounts upa on upa.id = uau.user_platform_account_id
         join achievement_platform_links apl on apl.id = uau.achievement_platform_link_id
         join canonical_achievements ca on ca.id = apl.canonical_achievement_id
         where upa.user_id = $1 and ca.tier = 'platinum'
         order by uau.unlocked_at asc`,
        [userId]
    );
    let longestPlatinumGapDays: number | null = null;
    for (let i = 1; i < platinums.rows.length; i++) {
        const gapDays =
            (new Date(platinums.rows[i].unlocked_at).getTime() - new Date(platinums.rows[i - 1].unlocked_at).getTime()) /
            (1000 * 60 * 60 * 24);
        if (longestPlatinumGapDays === null || gapDays > longestPlatinumGapDays) longestPlatinumGapDays = gapDays;
    }

    // Reuses the same unlocked/total counts the games list already computes
    // (and has already been tested against) rather than re-deriving
    // completion at the canonical-achievement level from scratch.
    const games = await getGamesForUser(userId);
    const fullyCompletedGames = games.filter(
        (g) => Number(g.total_achievements) > 0 && Number(g.unlocked_achievements) === Number(g.total_achievements)
    ).length;

    return {
        rarestAchievement: rarest.rows[0] ?? null,
        busiestPointsDay: busiestPointsDay.rows[0] ?? null,
        busiestUnlockDay: busiestUnlockDay.rows[0] ?? null,
        oldestUnlock: oldest.rows[0] ?? null,
        totalPlatinums: platinums.rows.length,
        longestPlatinumGapDays: longestPlatinumGapDays !== null ? Math.round(longestPlatinumGapDays) : null,
        fullyCompletedGames,
    };
}

// One row per (achievement, platform link) across the user's whole library -
// same join pattern as getAchievementsForGame below, just scoped to every
// owned game instead of one. Backs the "download my data" export (#26).
export async function getFullExportData(userId: string) {
    const result = await pool.query(
        `select
            g.title as game_title, apl.platform_id,
            ca.name as achievement_name, ca.description, ca.tier, ca.points,
            apl.global_unlock_rarity,
            (uau.id is not null) as unlocked, uau.unlocked_at
         from games g
         join canonical_achievements ca on ca.game_id = g.id
         join achievement_platform_links apl on apl.canonical_achievement_id = ca.id
         left join user_achievement_unlocks uau
                on uau.achievement_platform_link_id = apl.id
               and uau.user_platform_account_id in (
                   select id from user_platform_accounts where user_id = $1
               )
         where exists (
             select 1 from user_owned_games uog
             join user_platform_accounts upa on upa.id = uog.user_platform_account_id
             where upa.user_id = $1 and uog.game_id = g.id
         )
         order by g.title, apl.platform_id, ca.name`,
        [userId]
    );
    return result.rows;
}

export async function getAchievementsForGame(userId: string, gameId: string) {
    const owns = await pool.query(
        `select 1 from user_owned_games uog
         join user_platform_accounts upa on upa.id = uog.user_platform_account_id
         where upa.user_id = $1 and uog.game_id = $2
         limit 1`,
        [userId, gameId]
    );
    if (!owns.rows[0]) return null;

    const result = await pool.query(
        `select
            ca.id, ca.name, ca.description, ca.tier, ca.points,
            -- A user's own pasted icon (see #32) wins over the auto-detected
            -- one on canonical_achievements.icon_url, same reasoning as
            -- cover art overrides in getGamesForUser above.
            coalesce(
                (select icon_url from user_achievement_icon_overrides where user_id = $1 and canonical_achievement_id = ca.id),
                ca.icon_url
            ) as icon_url,
            apl.platform_id, apl.global_unlock_rarity, gpl.console_variant,
            (uau.id is not null) as unlocked, uau.unlocked_at
         from canonical_achievements ca
         join achievement_platform_links apl on apl.canonical_achievement_id = ca.id
         left join game_platform_links gpl
                on gpl.platform_id = apl.platform_id and gpl.platform_game_id = apl.platform_game_id
         left join user_achievement_unlocks uau
                on uau.achievement_platform_link_id = apl.id
               and uau.user_platform_account_id in (
                   select id from user_platform_accounts where user_id = $1
               )
         where ca.game_id = $2
         order by unlocked desc, apl.global_unlock_rarity asc nulls last`,
        [userId, gameId]
    );
    return result.rows;
}
