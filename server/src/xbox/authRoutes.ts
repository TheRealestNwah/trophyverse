import { Router } from "express";
import crypto from "crypto";
import { getAuthorizeUrl, exchangeCodeForToken, authenticateXboxLive, getXboxProfile } from "./oauth";
import { linkOrCreateUser } from "../auth/linkAccount";

declare module "express-session" {
    interface SessionData {
        xboxOAuthState?: string;
    }
}

export const xboxAuthRouter = Router();

xboxAuthRouter.get("/", (req, res) => {
    const state = crypto.randomBytes(16).toString("hex");
    req.session.xboxOAuthState = state;
    res.redirect(getAuthorizeUrl(state));
});

xboxAuthRouter.get("/callback", async (req, res, next) => {
    try {
        const { code, state } = req.query;
        if (!code || typeof code !== "string" || state !== req.session.xboxOAuthState) {
            return res.status(400).send("Invalid or expired Xbox login attempt. Please try again.");
        }
        delete req.session.xboxOAuthState;

        const tokens = await exchangeCodeForToken(code);
        const session = await authenticateXboxLive(tokens.access_token);
        const profile = await getXboxProfile(session);

        const user = await linkOrCreateUser(
            {
                platformId: "xbox",
                platformAccountId: profile.xuid,
                displayName: profile.gamertag,
                refreshToken: tokens.refresh_token,
            },
            req.isAuthenticated() ? req.user!.id : undefined
        );

        req.login(user, (err) => {
            if (err) return next(err);
            res.redirect("/");
        });
    } catch (err) {
        next(err);
    }
});
