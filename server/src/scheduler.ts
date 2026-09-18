import { pool } from "./db";
import { runAccountSync, PlatformAccountRow } from "./sync/runAccountSync";
import { recomputeUserScore } from "./scoring";
import { runMatching } from "./matching";

// Off by default (see config.ts / .env.example) - every account still syncs
// fine on demand from the dashboard, and this just automates that instead of
// requiring a click. One account failing (an expired PSN NPSSO, a revoked
// Xbox key) logs and moves on rather than aborting the whole run, since a
// scheduled job with no one watching it shouldn't silently stop covering
// every other account over one bad one.
export function startScheduler(intervalMinutes: number): void {
    const intervalMs = intervalMinutes * 60 * 1000;
    console.log(`Background sync scheduler enabled - running every ${intervalMinutes} minute(s).`);

    runScheduledSync().catch((err) => console.error("Scheduled sync failed:", err));
    setInterval(() => {
        runScheduledSync().catch((err) => console.error("Scheduled sync failed:", err));
    }, intervalMs);
}

async function runScheduledSync(): Promise<void> {
    const accounts = await pool.query(
        "select id, user_id, platform_id, platform_account_id, access_token, refresh_token from user_platform_accounts"
    );
    if (accounts.rows.length === 0) return;

    console.log(`Scheduled sync: syncing ${accounts.rows.length} linked account(s)...`);
    let succeeded = 0;

    for (const account of accounts.rows as PlatformAccountRow[]) {
        try {
            await runAccountSync(account);
            await recomputeUserScore(account.user_id);
            succeeded++;
        } catch (err) {
            console.error(`Scheduled sync failed for account ${account.id} (${account.platform_id}):`, err);
        }
    }

    // Cross-platform matches/tiers can shift with new data from any account,
    // and this already rescores every user as its last step.
    if (succeeded > 0) {
        await runMatching();
    }

    console.log(`Scheduled sync complete: ${succeeded}/${accounts.rows.length} account(s) synced.`);
}
