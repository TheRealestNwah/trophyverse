import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { runMatching } from "./index";
import { confirmMatchCandidate, rejectMatchCandidate } from "./achievementMatcher";
import { recomputeUserScore } from "../scoring";

export const matchingRouter = Router();

// Any signed-in user can trigger this for now - it's a global job with no
// per-user side effects beyond recomputing scores. A real deployment would
// run this on a schedule instead of on demand.
matchingRouter.post("/run", requireAuth, async (_req, res, next) => {
    try {
        res.json(await runMatching());
    } catch (err) {
        next(err);
    }
});

matchingRouter.get("/candidates", requireAuth, async (_req, res, next) => {
    try {
        const result = await pool.query(`
            select
                amc.id,
                amc.confidence,
                g.title as game_title,
                apl.platform_id as candidate_platform,
                apl.platform_name as candidate_name,
                target.name as target_name,
                target.tier as target_tier,
                target.tier_source as target_tier_source,
                (select array_agg(distinct platform_id) from achievement_platform_links where canonical_achievement_id = target.id) as target_platforms
            from achievement_match_candidates amc
            join achievement_platform_links apl on apl.id = amc.achievement_platform_link_id
            join canonical_achievements source_ca on source_ca.id = apl.canonical_achievement_id
            join games g on g.id = source_ca.game_id
            join canonical_achievements target on target.id = amc.candidate_canonical_achievement_id
            where amc.status = 'pending'
            order by amc.confidence desc
        `);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

matchingRouter.post("/candidates/:id/confirm", requireAuth, async (req, res, next) => {
    try {
        await confirmMatchCandidate(req.params.id);
        // Global data changed - the same recompute-everyone pass runMatching
        // does, since a merge can affect users other than whoever clicked.
        const users = await pool.query("select id from users");
        for (const user of users.rows) await recomputeUserScore(user.id);
        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

matchingRouter.post("/candidates/:id/reject", requireAuth, async (req, res, next) => {
    try {
        await rejectMatchCandidate(req.params.id);
        res.status(204).end();
    } catch (err) {
        next(err);
    }
});
