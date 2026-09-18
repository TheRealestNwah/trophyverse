import { Router } from "express";
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
