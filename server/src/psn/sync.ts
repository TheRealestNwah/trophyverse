import { pool } from "../db";
import { getUserTitles, getTitleTrophies, getUserTrophiesEarnedForTitle } from "./client";
import { getOrCreateCanonicalGame, getOrCreateAchievementLink, recordUnlock, recordOwnership } from "../sync/canonicalStore";
import { SyncSummary } from "../sync/types";

export async function syncPsnAccount(userPlatformAccountId: string, accessToken: string): Promise<SyncSummary> {
    const titles = await getUserTitles(accessToken);
    let achievementsUnlocked = 0;

    for (const title of titles) {
        const [definitions, earned] = await Promise.all([
            getTitleTrophies(accessToken, title.npCommunicationId, title.npServiceName),
            getUserTrophiesEarnedForTitle(accessToken, title.npCommunicationId, title.npServiceName),
        ]);
        if (definitions.length === 0) continue;

        const earnedById = new Map(earned.map((t) => [t.trophyId, t]));
        const gameId = await getOrCreateCanonicalGame("psn", title.npCommunicationId, title.trophyTitleName);
        await recordOwnership(userPlatformAccountId, gameId);

        for (const trophy of definitions) {
            const status = earnedById.get(trophy.trophyId);
            const rarity = status?.trophyEarnedRate ? Number(status.trophyEarnedRate) : undefined;

            const linkId = await getOrCreateAchievementLink(
                gameId,
                "psn",
                title.npCommunicationId,
                String(trophy.trophyId),
                trophy.trophyName ?? "Hidden trophy",
                trophy.trophyDetail,
                rarity,
                { tier: trophy.trophyType, tierSource: "psn_native" }
            );

            if (!status?.earned) continue;

            const isNew = await recordUnlock(
                userPlatformAccountId,
                linkId,
                status.earnedDateTime ? new Date(status.earnedDateTime) : new Date()
            );
            if (isNew) achievementsUnlocked++;
        }
    }

    await pool.query("update user_platform_accounts set last_synced_at = now() where id = $1", [
        userPlatformAccountId,
    ]);

    return { gamesProcessed: titles.length, achievementsUnlocked };
}
