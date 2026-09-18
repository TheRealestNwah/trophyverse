import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { runMatching } from "./index";

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
