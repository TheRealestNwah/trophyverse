import { pool } from "../db";
import {
    getOwnedGames,
    getSchemaForGame,
    getPlayerAchievements,
    getGlobalAchievementPercentages,
} from "./client";
import { getOrCreateCanonicalGame, getOrCreateAchievementLink } from "../games/canonicalUpsert";

export interface SyncSummary {
    gamesProcessed: number;
    achievementsUnlocked: number;
}

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

        for (const achievement of schema) {
            const linkId = await getOrCreateAchievementLink(
                "steam",
                gameId,
                String(game.appid),
                achievement.name,
                achievement.displayName,
                achievement.description,
                globalPercentages.get(achievement.name)
            );

            const unlock = unlockedByName.get(achievement.name);
            if (!unlock?.achieved) continue;

            const result = await pool.query(
                `insert into user_achievement_unlocks (user_platform_account_id, achievement_platform_link_id, unlocked_at)
                 values ($1, $2, to_timestamp($3))
                 on conflict (user_platform_account_id, achievement_platform_link_id) do nothing
                 returning id`,
                [userPlatformAccountId, linkId, unlock.unlocktime]
            );
            if (result.rows[0]) achievementsUnlocked++;
        }
    }

    await pool.query("update user_platform_accounts set last_synced_at = now() where id = $1", [
        userPlatformAccountId,
    ]);

    return { gamesProcessed: games.length, achievementsUnlocked };
}
