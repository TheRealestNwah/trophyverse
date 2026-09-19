import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { runMatching } from "./index";
import { confirmMatchCandidate, rejectMatchCandidate, matchAchievementsForGame } from "./achievementMatcher";
import { mergeGames } from "./gameMatcher";
import { recomputeUserScore } from "../scoring";
import { normalizeRarityTiersForAllGames, normalizeRarityTiersForGame } from "../scoring/rarityNormalization";

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

// Manual game merge: automatic matching (runMatching, above) only merges on
// exact normalized title, which deliberately misses genuine same-game cases
// with differently formatted titles across platforms (e.g. "Skyrim" on PSN
// vs "The Elder Scrolls V: Skyrim" on Steam - a fuzzy title match risks
// merging genuinely different games, so this needs a human to confirm it).
matchingRouter.post("/games/merge", requireAuth, async (req, res, next) => {
    try {
        const { keepGameId, mergeGameId } = req.body ?? {};
        if (!keepGameId || !mergeGameId || typeof keepGameId !== "string" || typeof mergeGameId !== "string") {
            return res.status(400).json({ error: "keepGameId and mergeGameId are required" });
        }
        if (keepGameId === mergeGameId) {
            return res.status(400).json({ error: "Can't merge a game with itself" });
        }

        // Scoped to games this user actually owns - canonical tables are
        // shared across every user of the app, so without this a user could
        // merge two games from the global catalog they've never even synced.
        const owned = await pool.query(
            `select game_id from user_owned_games uog
             join user_platform_accounts upa on upa.id = uog.user_platform_account_id
             where upa.user_id = $1 and uog.game_id in ($2, $3)`,
            [req.user!.id, keepGameId, mergeGameId]
        );
        if (owned.rows.length < 2) {
            return res.status(404).json({ error: "One or both games aren't in your library" });
        }

        await mergeGames(keepGameId, mergeGameId);

        // Scoped to just this game rather than the full runMatching() pass -
        // a merge only changes this one game's achievement set, so re-running
        // matching/rarity-tiering for the whole library (hundreds of
        // unrelated games) would make an interactive "click to merge" action
        // take many seconds for no benefit.
        const achievementResult = await matchAchievementsForGame(keepGameId);
        await normalizeRarityTiersForGame(keepGameId);

        // Still rescore every user who owns this (shared, canonical) game,
        // not just whoever clicked - the same reasoning as the candidate
        // confirm/reject handlers below.
        const affectedUsers = await pool.query(
            `select distinct upa.user_id from user_owned_games uog
             join user_platform_accounts upa on upa.id = uog.user_platform_account_id
             where uog.game_id = $1`,
            [keepGameId]
        );
        for (const user of affectedUsers.rows) await recomputeUserScore(user.user_id);

        res.json({ ...achievementResult, usersRescored: affectedUsers.rows.length });
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
        await normalizeRarityTiersForAllGames();
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
