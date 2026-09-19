import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { getGamesForUser, getAchievementsForGame } from "./queries";

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
        res.json(await getGamesForUser(req.user!.id));
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
