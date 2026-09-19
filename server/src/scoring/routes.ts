import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { getUserScore } from "./index";

export const scoreRouter = Router();

scoreRouter.get("/score", requireAuth, async (req, res, next) => {
    try {
        res.json(await getUserScore(req.user!.id));
    } catch (err) {
        next(err);
    }
});

// Public profile is opt-in and off by default (see db/schema.sql) - this is
// the only way it ever turns on, never a side effect of signing up or
// syncing. public_slug is generated once at signup and never changes here.
scoreRouter.post("/public-profile", requireAuth, async (req, res, next) => {
    try {
        const isPublic = Boolean(req.body?.isPublic);
        const result = await pool.query(
            "update users set is_public = $1 where id = $2 returning is_public, public_slug",
            [isPublic, req.user!.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});
