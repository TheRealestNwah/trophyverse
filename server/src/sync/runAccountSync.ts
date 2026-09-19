import { pool } from "../db";
import { syncSteamAccount } from "../steam/sync";
import { syncXboxAccount } from "../xbox/sync";
import { syncPsnAccount } from "../psn/sync";
import { exchangeRefreshTokenForTokens } from "../psn/client";
import { syncRetroAccount } from "../retro/sync";
import { syncGogAccount } from "../gog/sync";
import { exchangeRefreshTokenForTokens as exchangeGogRefreshTokenForTokens } from "../gog/client";
import { SyncSummary } from "./types";

export interface PlatformAccountRow {
    id: string;
    user_id: string;
    platform_id: string;
    platform_account_id: string;
    access_token: string | null;
    refresh_token: string | null;
}

// Dispatches to the right platform's sync function for one linked account,
// including PSN's refresh-then-sync dance (its access tokens last roughly an
// hour, so every sync refreshes unconditionally rather than tracking expiry).
// Shared by each platform's own /sync route and the background scheduler
// (scheduler.ts) so this per-platform logic - including PSN's token refresh -
// only lives in one place.
export async function runAccountSync(account: PlatformAccountRow): Promise<SyncSummary> {
    switch (account.platform_id) {
        case "steam":
            return syncSteamAccount(account.id, account.platform_account_id);

        case "xbox":
            return syncXboxAccount(account.id, account.access_token!, account.platform_account_id);

        case "psn": {
            const tokens = await exchangeRefreshTokenForTokens(account.refresh_token!);
            await pool.query(
                "update user_platform_accounts set access_token = $1, refresh_token = $2 where id = $3",
                [tokens.accessToken, tokens.refreshToken, account.id]
            );
            return syncPsnAccount(account.id, tokens.accessToken);
        }

        case "retroachievements":
            return syncRetroAccount(account.id, account.platform_account_id, account.access_token!);

        case "gog": {
            const tokens = await exchangeGogRefreshTokenForTokens(account.refresh_token!);
            await pool.query(
                "update user_platform_accounts set access_token = $1, refresh_token = $2 where id = $3",
                [tokens.accessToken, tokens.refreshToken, account.id]
            );
            return syncGogAccount(account.id, tokens.accessToken, account.platform_account_id);
        }

        default:
            throw new Error(`No sync handler for platform: ${account.platform_id}`);
    }
}
