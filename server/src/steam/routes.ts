import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { syncSteamAccount } from "./sync";
import { recomputeUserScore } from "../scoring";

export const steamRouter = Router();

steamRouter.post("/sync", requireAuth, async (req, res, next) => {
    try {
        const account = await pool.query(
            "select id, platform_account_id from user_platform_accounts where user_id = $1 and platform_id = 'steam'",
            [req.user!.id]
        );
        if (!account.rows[0]) {
            return res.status(404).json({ error: "No linked Steam account" });
        }
        const summary = await syncSteamAccount(account.rows[0].id, account.rows[0].platform_account_id);
        const score = await recomputeUserScore(req.user!.id);
        res.json({ ...summary, score });
    } catch (err) {
        next(err);
    }
});
