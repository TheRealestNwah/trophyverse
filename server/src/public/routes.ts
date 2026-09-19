import { Router } from "express";
import { pool } from "../db";
import { getUserScore } from "../scoring";
import { getGamesForUser, getAchievementsForGame } from "../games/queries";

export const publicRouter = Router();

async function getPublicUserId(slug: string): Promise<{ id: string; username: string } | null> {
    const result = await pool.query("select id, username from users where public_slug = $1 and is_public = true", [
        slug,
    ]);
    return result.rows[0] ?? null;
}

// No requireAuth anywhere in this router - these are the only routes in the
// app meant to be reachable by someone with no account at all, deliberately
// mirroring PSNProfiles-style public profile pages. Gated entirely on
// is_public (see db/schema.sql / scoring/routes.ts's toggle) - a slug alone
// isn't enough, since generateUniqueSlug runs for every signup regardless of
// whether that user ever opts in.
publicRouter.get("/:slug", async (req, res, next) => {
    try {
        const user = await getPublicUserId(req.params.slug);
        if (!user) return res.status(404).json({ error: "No public profile with that name" });

        const score = await getUserScore(user.id);
        res.json({ username: user.username, score });
    } catch (err) {
        next(err);
    }
});

publicRouter.get("/:slug/games", async (req, res, next) => {
    try {
        const user = await getPublicUserId(req.params.slug);
        if (!user) return res.status(404).json({ error: "No public profile with that name" });

        res.json(await getGamesForUser(user.id));
    } catch (err) {
        next(err);
    }
});

publicRouter.get("/:slug/games/:gameId/achievements", async (req, res, next) => {
    try {
        const user = await getPublicUserId(req.params.slug);
        if (!user) return res.status(404).json({ error: "No public profile with that name" });

        const achievements = await getAchievementsForGame(user.id, req.params.gameId);
        if (!achievements) return res.status(404).json({ error: "Game not found in that profile's library" });
        res.json(achievements);
    } catch (err) {
        next(err);
    }
});
