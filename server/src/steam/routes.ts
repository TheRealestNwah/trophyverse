import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { syncSteamAccount } from "./sync";
import { recomputeUserScore } from "../scoring";

export const steamRouter = Router();

async function getSteamAccount(userId: string) {
    const result = await pool.query(
        "select id, platform_account_id from user_platform_accounts where user_id = $1 and platform_id = 'steam'",
        [userId]
    );
    return result.rows[0] as { id: string; platform_account_id: string } | undefined;
}

steamRouter.post("/sync", requireAuth, async (req, res, next) => {
    try {
        const account = await getSteamAccount(req.user!.id);
        if (!account) {
            return res.status(404).json({ error: "No linked Steam account" });
        }
        const summary = await syncSteamAccount(account.id, account.platform_account_id);
        const score = await recomputeUserScore(req.user!.id);
        res.json({ ...summary, score });
    } catch (err) {
        next(err);
    }
});

steamRouter.get("/games", requireAuth, async (req, res, next) => {
    try {
        const account = await getSteamAccount(req.user!.id);
        if (!account) {
            return res.status(404).json({ error: "No linked Steam account" });
        }
        const result = await pool.query(
            `select
                g.id,
                g.title,
                count(ca.id) as total_achievements,
                count(uau.id) as unlocked_achievements,
                coalesce(sum(ca.points) filter (where uau.id is not null), 0) as points_earned,
                count(*) filter (where ca.tier = 'platinum' and uau.id is not null) as platinum_unlocked,
                count(*) filter (where ca.tier = 'gold' and uau.id is not null) as gold_unlocked,
                count(*) filter (where ca.tier = 'silver' and uau.id is not null) as silver_unlocked,
                count(*) filter (where ca.tier = 'bronze' and uau.id is not null) as bronze_unlocked
             from game_platform_links gpl
             join games g on g.id = gpl.game_id
             join canonical_achievements ca on ca.game_id = g.id
             left join achievement_platform_links apl on apl.canonical_achievement_id = ca.id
             left join user_achievement_unlocks uau
                    on uau.achievement_platform_link_id = apl.id
                   and uau.user_platform_account_id = $1
             where gpl.platform_id = 'steam'
             group by g.id, g.title
             order by unlocked_achievements desc, g.title`,
            [account.id]
        );
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

steamRouter.get("/games/:gameId/achievements", requireAuth, async (req, res, next) => {
    try {
        const account = await getSteamAccount(req.user!.id);
        if (!account) {
            return res.status(404).json({ error: "No linked Steam account" });
        }
        const result = await pool.query(
            `select
                ca.id, ca.name, ca.description, ca.tier, ca.points,
                apl.global_unlock_rarity,
                (uau.id is not null) as unlocked,
                uau.unlocked_at
             from canonical_achievements ca
             join achievement_platform_links apl on apl.canonical_achievement_id = ca.id
             left join user_achievement_unlocks uau
                    on uau.achievement_platform_link_id = apl.id
                   and uau.user_platform_account_id = $1
             where ca.game_id = $2 and apl.platform_id = 'steam'
             order by unlocked desc, apl.global_unlock_rarity asc nulls last`,
            [account.id, req.params.gameId]
        );
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});
