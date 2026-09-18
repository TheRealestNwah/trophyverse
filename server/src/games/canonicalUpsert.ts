import { pool } from "../db";
import { resolveTierFromRarity } from "../scoring/tier";

// Shared by every platform client's sync job: find-or-create the canonical
// game/achievement rows a platform-specific achievement links to. See
// docs/data-model.md for why canonical + link tables exist.

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
    platformId: string,
    gameId: string,
    platformGameId: string,
    platformAchievementId: string,
    displayName: string,
    description: string | undefined,
    globalRarity: number | undefined
): Promise<string> {
    // Platform achievement IDs are only unique within one game, so the
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
            [gameId, displayName, description ?? null, tier, points]
        );
        const link = await client.query(
            `insert into achievement_platform_links
                (canonical_achievement_id, platform_id, platform_game_id, platform_achievement_id, platform_name, platform_description, global_unlock_rarity)
             values ($1, $2, $3, $4, $5, $6, $7) returning id`,
            [canonical.rows[0].id, platformId, platformGameId, platformAchievementId, displayName, description ?? null, globalRarity ?? null]
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
