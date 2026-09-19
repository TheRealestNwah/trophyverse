import { Router } from "express";
import { pool } from "../db";
import { getUserScore } from "../scoring";
import { getGamesForUser, getAchievementsForGame, getRecentActivity, getFunStats } from "../games/queries";

export const publicRouter = Router();

async function getPublicUserId(slug: string): Promise<{ id: string; username: string } | null> {
    const result = await pool.query("select id, username from users where public_slug = $1 and is_public = true", [
        slug,
    ]);
    return result.rows[0] ?? null;
}

// Registered before the "/:slug" route below - Express matches routes in
// order, and "/:slug" would otherwise swallow "/leaderboard" as if it were
// someone's slug. Ranks only opted-in public profiles (see db/schema.sql) -
// a private user's score never appears here, same as it never appears
// anywhere else outside their own dashboard.
publicRouter.get("/leaderboard", async (_req, res, next) => {
    try {
        const result = await pool.query(
            `select u.username, u.public_slug, us.total_points, us.level
             from user_scores us
             join users u on u.id = us.user_id
             where u.is_public = true
             order by us.total_points desc
             limit 50`
        );
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

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

publicRouter.get("/:slug/activity", async (req, res, next) => {
    try {
        const user = await getPublicUserId(req.params.slug);
        if (!user) return res.status(404).json({ error: "No public profile with that name" });

        res.json(await getRecentActivity(user.id));
    } catch (err) {
        next(err);
    }
});

publicRouter.get("/:slug/stats", async (req, res, next) => {
    try {
        const user = await getPublicUserId(req.params.slug);
        if (!user) return res.status(404).json({ error: "No public profile with that name" });

        res.json(await getFunStats(user.id));
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
