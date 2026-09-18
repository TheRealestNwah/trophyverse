import { pool } from "../db";
import {
    getOwnedGames,
    getSchemaForGame,
    getPlayerAchievements,
    getGlobalAchievementPercentages,
} from "./client";

// No PSN match exists yet for a freshly-synced Steam achievement (that's a
// later matching job's job), so tier is inferred from global unlock rarity.
// See docs/data-model.md for why this is a distinct, revisitable tier_source.
function resolveTierFromRarity(percent: number | undefined): { tier: string; points: number } {
    const p = percent ?? 100; // unknown rarity: treat as common rather than over-crediting it
    if (p < 5) return { tier: "platinum", points: 300 };
    if (p < 15) return { tier: "gold", points: 90 };
    if (p < 50) return { tier: "silver", points: 30 };
    return { tier: "bronze", points: 15 };
}

async function getOrCreateCanonicalGame(appId: number, title: string): Promise<string> {
    const existing = await pool.query(
        "select game_id from game_platform_links where platform_id = 'steam' and platform_game_id = $1",
        [String(appId)]
    );
    if (existing.rows[0]) return existing.rows[0].game_id;

    const client = await pool.connect();
    try {
        await client.query("begin");
        const game = await client.query("insert into games (title) values ($1) returning id", [title]);
        await client.query(
            `insert into game_platform_links (game_id, platform_id, platform_game_id, platform_title)
             values ($1, 'steam', $2, $3)`,
            [game.rows[0].id, String(appId), title]
        );
        await client.query("commit");
        return game.rows[0].id;
    } catch (err) {
        await client.query("rollback");
        throw err;
    } finally {
        client.release();
    }
}

async function getOrCreateAchievementLink(
    gameId: string,
    apiName: string,
    displayName: string,
    description: string | undefined,
    globalRarity: number | undefined
): Promise<string> {
    const existing = await pool.query(
        "select id from achievement_platform_links where platform_id = 'steam' and platform_achievement_id = $1",
        [apiName]
    );
    if (existing.rows[0]) return existing.rows[0].id;

    const { tier, points } = resolveTierFromRarity(globalRarity);

    const client = await pool.connect();
    try {
        await client.query("begin");
        const canonical = await client.query(
            `insert into canonical_achievements (game_id, name, description, tier, tier_source, points)
             values ($1, $2, $3, $4, 'rarity_fallback', $5) returning id`,
            [gameId, displayName, description ?? null, tier, points]
        );
        const link = await client.query(
            `insert into achievement_platform_links
                (canonical_achievement_id, platform_id, platform_achievement_id, platform_name, platform_description, global_unlock_rarity)
             values ($1, 'steam', $2, $3, $4, $5) returning id`,
            [canonical.rows[0].id, apiName, displayName, description ?? null, globalRarity ?? null]
        );
        await client.query("commit");
        return link.rows[0].id;
    } catch (err) {
        await client.query("rollback");
        throw err;
    } finally {
        client.release();
    }
}

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

        const gameId = await getOrCreateCanonicalGame(game.appid, game.name);

        for (const achievement of schema) {
            const linkId = await getOrCreateAchievementLink(
                gameId,
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
