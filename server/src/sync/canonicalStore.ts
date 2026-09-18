import { pool } from "../db";
import { resolveTierFromRarity } from "../scoring/tier";

// Shared by every platform's sync job: finds or creates the canonical
// games/achievements rows a platform-specific achievement should attach to.
// See docs/data-model.md for why canonical + link tables exist at all.

export async function getOrCreateCanonicalGame(
    platformId: string,
    platformGameId: string,
    title: string
): Promise<string> {
    const existing = await pool.query(
        "select game_id from game_platform_links where platform_id = $1 and platform_game_id = $2",
        [platformId, platformGameId]
    );
    if (existing.rows[0]) return existing.rows[0].game_id;

    const client = await pool.connect();
    try {
        await client.query("begin");
        const game = await client.query("insert into games (title) values ($1) returning id", [title]);
        await client.query(
            `insert into game_platform_links (game_id, platform_id, platform_game_id, platform_title)
             values ($1, $2, $3, $4)`,
            [game.rows[0].id, platformId, platformGameId, title]
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

export async function getOrCreateAchievementLink(
    gameId: string,
    platformId: string,
    platformGameId: string,
    platformAchievementId: string,
    name: string,
    description: string | undefined,
    globalRarity: number | undefined
): Promise<string> {
    // Platform achievement IDs are typically only unique within one game
    // (e.g. Steam's api names, Xbox's small per-title integer IDs), so the
    // lookup must be scoped by the platform's game ID too.
    const existing = await pool.query(
        "select id from achievement_platform_links where platform_id = $1 and platform_game_id = $2 and platform_achievement_id = $3",
        [platformId, platformGameId, platformAchievementId]
    );
    if (existing.rows[0]) return existing.rows[0].id;

    const { tier, points } = resolveTierFromRarity(globalRarity);

    const client = await pool.connect();
    try {
        await client.query("begin");
        const canonical = await client.query(
            `insert into canonical_achievements (game_id, name, description, tier, tier_source, points)
             values ($1, $2, $3, $4, 'rarity_fallback', $5) returning id`,
            [gameId, name, description ?? null, tier, points]
        );
        const link = await client.query(
            `insert into achievement_platform_links
                (canonical_achievement_id, platform_id, platform_game_id, platform_achievement_id, platform_name, platform_description, global_unlock_rarity)
             values ($1, $2, $3, $4, $5, $6, $7) returning id`,
            [canonical.rows[0].id, platformId, platformGameId, platformAchievementId, name, description ?? null, globalRarity ?? null]
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

export async function recordOwnership(userPlatformAccountId: string, gameId: string): Promise<void> {
    await pool.query(
        `insert into user_owned_games (user_platform_account_id, game_id)
         values ($1, $2)
         on conflict (user_platform_account_id, game_id) do nothing`,
        [userPlatformAccountId, gameId]
    );
}

// Returns true if this was a newly recorded unlock (false if already existed).
export async function recordUnlock(
    userPlatformAccountId: string,
    achievementLinkId: string,
    unlockedAt: Date
): Promise<boolean> {
    const result = await pool.query(
        `insert into user_achievement_unlocks (user_platform_account_id, achievement_platform_link_id, unlocked_at)
         values ($1, $2, $3)
         on conflict (user_platform_account_id, achievement_platform_link_id) do nothing
         returning id`,
        [userPlatformAccountId, achievementLinkId, unlockedAt]
    );
    return result.rows.length > 0;
}
