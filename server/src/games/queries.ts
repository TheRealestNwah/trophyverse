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
            g.cover_image_url,
            (select array_agg(distinct platform_id) from game_platform_links where game_id = g.id) as platforms,
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
            ca.id, ca.name, ca.description, ca.tier, ca.points, ca.icon_url,
            apl.platform_id, apl.global_unlock_rarity,
            (uau.id is not null) as unlocked, uau.unlocked_at
         from canonical_achievements ca
         join achievement_platform_links apl on apl.canonical_achievement_id = ca.id
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
