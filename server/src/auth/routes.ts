import { Router } from "express";
import { passport } from "./passport";
import { requireAuth } from "../middleware/requireAuth";

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

authRouter.get("/me", requireAuth, (req, res) => {
    res.json(req.user);
});
