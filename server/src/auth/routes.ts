import { Router } from "express";
import { passport } from "./passport";
import { requireAuth } from "../middleware/requireAuth";
import { pool } from "../db";

export const authRouter = Router();

authRouter.get("/steam", passport.authenticate("steam"));

authRouter.get(
    "/steam/return",
    passport.authenticate("steam", { failureRedirect: "/" }),
    (_req, res) => res.redirect("/")
);

authRouter.post("/logout", (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.status(204).end();
    });
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
    try {
        const linked = await pool.query(
            "select platform_id, display_name, last_synced_at from user_platform_accounts where user_id = $1",
            [req.user!.id]
        );
        res.json({ ...req.user, linkedPlatforms: linked.rows });
    } catch (err) {
        next(err);
    }
});
