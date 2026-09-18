import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";

export const gamesRouter = Router();

gamesRouter.get("/accounts", requireAuth, async (req, res, next) => {
    try {
        const result = await pool.query(
            "select platform_id, display_name, linked_at, last_synced_at from user_platform_accounts where user_id = $1 order by platform_id",
            [req.user!.id]
        );
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

gamesRouter.get("/games", requireAuth, async (req, res, next) => {
    try {
        const result = await pool.query(
            `select
                g.id,
                g.title,
                (select array_agg(distinct platform_id) from game_platform_links where game_id = g.id) as platforms,
                count(ca.id) as total_achievements,
                count(uau.id) as unlocked_achievements,
                coalesce(sum(ca.points) filter (where uau.id is not null), 0) as points_earned,
                count(*) filter (where ca.tier = 'platinum' and uau.id is not null) as platinum_unlocked,
                count(*) filter (where ca.tier = 'gold' and uau.id is not null) as gold_unlocked,
                count(*) filter (where ca.tier = 'silver' and uau.id is not null) as silver_unlocked,
                count(*) filter (where ca.tier = 'bronze' and uau.id is not null) as bronze_unlocked
             from user_owned_games uog
             join user_platform_accounts upa on upa.id = uog.user_platform_account_id and upa.user_id = $1
             join games g on g.id = uog.game_id
             join canonical_achievements ca on ca.game_id = g.id
             left join achievement_platform_links apl on apl.canonical_achievement_id = ca.id
             left join user_achievement_unlocks uau
                    on uau.achievement_platform_link_id = apl.id
                   and uau.user_platform_account_id in (
                       select id from user_platform_accounts where user_id = $1
                   )
             group by g.id, g.title
             order by unlocked_achievements desc, g.title`,
            [req.user!.id]
        );
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

gamesRouter.get("/games/:gameId/achievements", requireAuth, async (req, res, next) => {
    try {
        const owns = await pool.query(
            `select 1 from user_owned_games uog
             join user_platform_accounts upa on upa.id = uog.user_platform_account_id
             where upa.user_id = $1 and uog.game_id = $2`,
            [req.user!.id, req.params.gameId]
        );
        if (!owns.rows[0]) {
            return res.status(404).json({ error: "Game not found in your library" });
        }

        const result = await pool.query(
            `select
                ca.id, ca.name, ca.description, ca.tier, ca.points,
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
            [req.user!.id, req.params.gameId]
        );
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});
