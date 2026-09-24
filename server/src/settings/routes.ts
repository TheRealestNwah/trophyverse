import { Router } from "express";
import { getCsrfToken } from "../middleware/csrf";
import { requireAuth } from "../middleware/requireAuth";
import { isValidSteamApiKey, saveSteamApiKey, steamApiKeySource } from "./steamApiKey";
import { getSteamGridDbApiKey, isValidSteamGridDbApiKey, removeSteamGridDbApiKey, saveSteamGridDbApiKey } from "./steamGridDbKey";

export const setupRouter = Router();
export const settingsRouter = Router();

settingsRouter.get("/steamgriddb-api-key", requireAuth, async (_req, res, next) => {
    try {
        res.json({ configured: Boolean(await getSteamGridDbApiKey()) });
    } catch (err) {
        next(err);
    }
});

settingsRouter.put("/steamgriddb-api-key", requireAuth, async (req, res, next) => {
    try {
        const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
        if (!/^\S{1,200}$/.test(apiKey)) {
            res.status(400).json({ error: "Paste the API key from your SteamGridDB preferences." });
            return;
        }
        if (!(await isValidSteamGridDbApiKey(apiKey))) {
            res.status(400).json({ error: "SteamGridDB rejected that key. Check it at steamgriddb.com/profile/preferences/api." });
            return;
        }
        await saveSteamGridDbApiKey(apiKey);
        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

settingsRouter.delete("/steamgriddb-api-key", requireAuth, async (_req, res, next) => {
    try {
        await removeSteamGridDbApiKey();
        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

// Reachable before sign-in: the Steam key has to exist before anyone can sign
// in with Steam at all.
setupRouter.get("/status", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const source = steamApiKeySource();
    res.json({
        steamApiKeyConfigured: source !== null,
        steamApiKeyEditable: source !== "env",
        csrfToken: getCsrfToken(req),
    });
});

setupRouter.put("/steam-api-key", async (req, res, next) => {
    try {
        const source = steamApiKeySource();
        if (source === "env") {
            res.status(409).json({ error: "The Steam Web API key is set by the STEAM_API_KEY environment variable." });
            return;
        }
        // First-run setup is open; replacing an existing key needs a session.
        if (source !== null && !req.isAuthenticated()) {
            res.status(401).json({ error: "Sign in to change the Steam Web API key." });
            return;
        }

        const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
        if (!/^[A-Fa-f0-9]{32}$/.test(apiKey)) {
            res.status(400).json({ error: "A Steam Web API key is 32 hexadecimal characters." });
            return;
        }
        if (!(await isValidSteamApiKey(apiKey))) {
            res.status(400).json({ error: "Steam rejected that key. Check it at steamcommunity.com/dev/apikey." });
            return;
        }

        await saveSteamApiKey(apiKey);
        res.status(204).end();
    } catch (err) {
        next(err);
    }
});
