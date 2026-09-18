import { pool } from "../db";
import { getOrCreateCanonicalGame, getOrCreateAchievementLink } from "../games/canonicalUpsert";
import { resumeXboxSession } from "./oauth";
import { getTitleHistory, getAchievementsForTitle } from "./client";

export interface SyncSummary {
    gamesProcessed: number;
    achievementsUnlocked: number;
}

export async function syncXboxAccount(
    userPlatformAccountId: string,
    xuid: string,
    storedRefreshToken: string
): Promise<SyncSummary> {
    const { session, newRefreshToken } = await resumeXboxSession(storedRefreshToken);
    // Xbox rotates refresh tokens on use - persist the new one immediately
    // so a failed sync later doesn't strand the account on a stale token.
    await pool.query("update user_platform_accounts set refresh_token = $1 where id = $2", [
        newRefreshToken,
        userPlatformAccountId,
    ]);

    const titles = await getTitleHistory(xuid, session);
    let achievementsUnlocked = 0;

    for (const title of titles) {
        const achievements = await getAchievementsForTitle(xuid, title.titleId, session);
        if (achievements.length === 0) continue;

        const gameId = await getOrCreateCanonicalGame("xbox", title.titleId, title.name);

        for (const achievement of achievements) {
            const linkId = await getOrCreateAchievementLink(
                "xbox",
                gameId,
                title.titleId,
                achievement.id,
                achievement.name,
                achievement.description,
                achievement.globalUnlockRarity
            );

            if (!achievement.unlocked) continue;

            const result = await pool.query(
                `insert into user_achievement_unlocks (user_platform_account_id, achievement_platform_link_id, unlocked_at)
                 values ($1, $2, coalesce($3::timestamptz, now()))
                 on conflict (user_platform_account_id, achievement_platform_link_id) do nothing
                 returning id`,
                [userPlatformAccountId, linkId, achievement.unlockedAt ?? null]
            );
            if (result.rows[0]) achievementsUnlocked++;
        }
    }

    await pool.query("update user_platform_accounts set last_synced_at = now() where id = $1", [
        userPlatformAccountId,
    ]);

    return { gamesProcessed: titles.length, achievementsUnlocked };
}
