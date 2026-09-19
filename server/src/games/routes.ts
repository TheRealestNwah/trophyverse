import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { getGamesForUser, getAchievementsForGame, getRecentActivity } from "./queries";
import { recomputeUserScore } from "../scoring";

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

// Steam can't be disconnected here - it's the sign-in identity, not just a
// linked data source, so there's no account left to be signed in as
// afterward. Deleting the user_platform_accounts row cascades to that
// account's own user_owned_games/user_achievement_unlocks (see
// db/schema.sql's ON DELETE CASCADE) without touching the shared canonical
// games/achievements tables other users or platforms still reference.
gamesRouter.delete("/accounts/:platformId", requireAuth, async (req, res, next) => {
    try {
        const { platformId } = req.params;
        if (platformId === "steam") {
            return res.status(400).json({ error: "Steam can't be disconnected - it's how you sign in." });
        }

        const result = await pool.query(
            "delete from user_platform_accounts where user_id = $1 and platform_id = $2 returning id",
            [req.user!.id, platformId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "No linked account for that platform" });
        }

        const score = await recomputeUserScore(req.user!.id);
        res.json({ score });
    } catch (err) {
        next(err);
    }
});

gamesRouter.get("/games", requireAuth, async (req, res, next) => {
    try {
        res.json(await getGamesForUser(req.user!.id));
    } catch (err) {
        next(err);
    }
});

gamesRouter.get("/activity", requireAuth, async (req, res, next) => {
    try {
        res.json(await getRecentActivity(req.user!.id));
    } catch (err) {
        next(err);
    }
});

gamesRouter.get("/games/:gameId/achievements", requireAuth, async (req, res, next) => {
    try {
        const achievements = await getAchievementsForGame(req.user!.id, req.params.gameId);
        if (!achievements) {
            return res.status(404).json({ error: "Game not found in your library" });
        }
        res.json(achievements);
    } catch (err) {
        next(err);
    }
});
