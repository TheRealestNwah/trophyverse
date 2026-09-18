import { pool } from "../db";
import {
    getOwnedGames,
    getSchemaForGame,
    getPlayerAchievements,
    getGlobalAchievementPercentages,
} from "./client";
import { getOrCreateCanonicalGame, getOrCreateAchievementLink, recordUnlock, recordOwnership } from "../sync/canonicalStore";
import { SyncSummary } from "../sync/types";

export async function syncSteamAccount(userPlatformAccountId: string, steamId: string): Promise<SyncSummary> {
    const games = await getOwnedGames(steamId);
    let achievementsUnlocked = 0;

    for (const game of games) {
        const schema = await getSchemaForGame(game.appid);
        if (schema.length === 0) continue; // game has no achievements

        const [playerAchievements, globalPercentages] = await Promise.all([
            getPlayerAchievements(game.appid, steamId),
            getGlobalAchievementPercentages(game.appid),
        ]);
        const unlockedByName = new Map(playerAchievements.map((a) => [a.apiname, a]));

        const gameId = await getOrCreateCanonicalGame("steam", String(game.appid), game.name);
        await recordOwnership(userPlatformAccountId, gameId);

        for (const achievement of schema) {
            const linkId = await getOrCreateAchievementLink(
                gameId,
                "steam",
                String(game.appid),
                achievement.name,
                achievement.displayName,
                achievement.description,
                globalPercentages.get(achievement.name)
            );

            const unlock = unlockedByName.get(achievement.name);
            if (!unlock?.achieved) continue;

            const isNew = await recordUnlock(userPlatformAccountId, linkId, new Date(unlock.unlocktime * 1000));
            if (isNew) achievementsUnlocked++;
        }
    }

    await pool.query("update user_platform_accounts set last_synced_at = now() where id = $1", [
        userPlatformAccountId,
    ]);

    return { gamesProcessed: games.length, achievementsUnlocked };
}
