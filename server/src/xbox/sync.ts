import { pool } from "../db";
import { getTitles, getAchievementsForTitle, getX360AchievementsForTitle } from "./client";
import {
    getOrCreateCanonicalGame,
    getOrCreateAchievementLink,
    recordUnlock,
    revokeUnlockIfPresent,
    recordOwnership,
    reconcileOwnershipForPlatform,
} from "../sync/canonicalStore";
import { normalizeRarityTiersForGame } from "../scoring/rarityNormalization";
import { SyncSummary } from "../sync/types";

export async function syncXboxAccount(userPlatformAccountId: string, apiKey: string, xuid: string): Promise<SyncSummary> {
    const titles = await getTitles(apiKey);
    let achievementsUnlocked = 0;
    let achievementsRevoked = 0;
    let gamesProcessed = 0;

    for (const title of titles) {
        if (title.totalAchievements === 0) continue;

        let achievements = await getAchievementsForTitle(apiKey, title.titleId);
        // Which endpoint actually had data doubles as the only reliable
        // console-generation signal OpenXBL gives us - see #36. The
        // `devices` field on /v2/titles reports backward-compatibility, not
        // origin generation (a classic 360 title playable via compat on
        // newer consoles lists all three), so it can't tell One from Series.
        // This can: only classic 360 titles fall through to the legacy
        // endpoint, which is a real, already-verified signal, just not a
        // 3-way split - and it can't tell PC from console at all, since the
        // Xbox app on PC uses the same modern achievements endpoint as
        // Xbox One/Series (see #77). No variant label for that ambiguous
        // case rather than a claim we can't back up - "Xbox 360" is left as
        // the one case where this signal is actually reliable.
        let consoleVariant: string | undefined;
        if (achievements.length === 0) {
            // Classic Xbox 360 titles use a separate legacy achievements
            // contract - see getX360AchievementsForTitle for what's different.
            achievements = await getX360AchievementsForTitle(apiKey, xuid, title.titleId);
            consoleVariant = "Xbox 360";
        }
        if (achievements.length === 0) continue;

        const gameId = await getOrCreateCanonicalGame("xbox", title.titleId, title.name, title.coverImageUrl, consoleVariant);
        await recordOwnership(userPlatformAccountId, gameId);
        gamesProcessed++;

        for (const achievement of achievements) {
            const linkId = await getOrCreateAchievementLink(
                gameId,
                "xbox",
                title.titleId,
                achievement.id,
                achievement.name,
                achievement.description,
                achievement.rarityPercent,
                undefined,
                achievement.iconUrl
            );

            if (!achievement.isUnlocked) {
                // See #57 - correct a previously recorded unlock if Xbox
                // now reports this as not achieved, rather than leaving it
                // credited forever.
                if (await revokeUnlockIfPresent(userPlatformAccountId, linkId)) achievementsRevoked++;
                continue;
            }

            const isNew = await recordUnlock(
                userPlatformAccountId,
                linkId,
                achievement.timeUnlocked ? new Date(achievement.timeUnlocked) : new Date()
            );
            if (isNew) achievementsUnlocked++;
        }

        await normalizeRarityTiersForGame(gameId);
    }

    const { gamesReconciled, achievementsRevoked: reconciledRevocations } = await reconcileOwnershipForPlatform(
        userPlatformAccountId,
        "xbox",
        titles.map((t) => t.titleId)
    );
    achievementsRevoked += reconciledRevocations;

    await pool.query("update user_platform_accounts set last_synced_at = now() where id = $1", [
        userPlatformAccountId,
    ]);

    return { gamesProcessed, achievementsUnlocked, achievementsRevoked, gamesReconciled };
}
