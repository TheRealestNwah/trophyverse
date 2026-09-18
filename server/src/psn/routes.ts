import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { exchangeNpssoForAccessCode, exchangeAccessCodeForTokens, exchangeRefreshTokenForTokens, decodeIdToken, PsnApiError } from "./client";
import { syncPsnAccount } from "./sync";
import { recomputeUserScore } from "../scoring";

export const psnRouter = Router();

async function getPsnAccount(userId: string) {
    const result = await pool.query(
        "select id, access_token, refresh_token from user_platform_accounts where user_id = $1 and platform_id = 'psn'",
        [userId]
    );
    return result.rows[0] as { id: string; access_token: string; refresh_token: string } | undefined;
}

// No OAuth redirect flow here - the user pastes an NPSSO token, retrieved by
// visiting https://ca.account.sony.com/api/v1/ssocookie while logged into
// playstation.com in their own browser. We exchange it for real OAuth tokens
// server-side and never see their PSN password.
psnRouter.post("/connect", requireAuth, async (req, res, next) => {
    try {
        const npsso = req.body?.npsso;
        if (!npsso || typeof npsso !== "string") {
            return res.status(400).json({ error: "npsso is required" });
        }

        const accessCode = await exchangeNpssoForAccessCode(npsso);
        const tokens = await exchangeAccessCodeForTokens(accessCode);
        const { onlineId, accountId } = decodeIdToken(tokens.idToken);

        await pool.query(
            `insert into user_platform_accounts (user_id, platform_id, platform_account_id, display_name, access_token, refresh_token)
             values ($1, 'psn', $2, $3, $4, $5)
             on conflict (user_id, platform_id) do update
                set platform_account_id = excluded.platform_account_id,
                    display_name = excluded.display_name,
                    access_token = excluded.access_token,
                    refresh_token = excluded.refresh_token`,
            [req.user!.id, accountId, onlineId, tokens.accessToken, tokens.refreshToken]
        );

        res.json({ onlineId });
    } catch (err) {
        if (err instanceof PsnApiError && err.status === 401) {
            return res.status(400).json({ error: err.message });
        }
        next(err);
    }
});

psnRouter.post("/sync", requireAuth, async (req, res, next) => {
    try {
        const account = await getPsnAccount(req.user!.id);
        if (!account) {
            return res.status(404).json({ error: "No linked PlayStation account" });
        }

        // Access tokens last roughly an hour, so refresh unconditionally
        // rather than tracking expiry ourselves.
        const tokens = await exchangeRefreshTokenForTokens(account.refresh_token);
        await pool.query("update user_platform_accounts set access_token = $1, refresh_token = $2 where id = $3", [
            tokens.accessToken,
            tokens.refreshToken,
            account.id,
        ]);

        const summary = await syncPsnAccount(account.id, tokens.accessToken);
        const score = await recomputeUserScore(req.user!.id);
        res.json({ ...summary, score });
    } catch (err) {
        if (err instanceof PsnApiError && err.status === 401) {
            return res.status(400).json({ error: "Your PlayStation session expired - reconnect with a fresh NPSSO token." });
        }
        next(err);
    }
});
