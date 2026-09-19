import { pool } from "../db";
import { normalize } from "./normalize";

export interface GameMatchResult {
    groupsMerged: number;
    gamesRemoved: number;
}

// Cross-platform game matching: exact match on normalized title only (case,
// punctuation, trademark symbols stripped). Deliberately not fuzzy - editions
// and subtitles ("Skyrim" vs "Skyrim Special Edition") are often genuinely
// different achievement sets, so a stricter match avoids merging games that
// only look similar.
export async function matchGames(): Promise<GameMatchResult> {
    const rows = await pool.query(`
        select g.id, g.title, array_agg(distinct gpl.platform_id) as platforms
        from games g
        join game_platform_links gpl on gpl.game_id = g.id
        group by g.id, g.title
    `);

    const groups = new Map<string, Array<{ id: string; platforms: string[] }>>();
    for (const row of rows.rows) {
        const key = normalize(row.title);
        const list = groups.get(key) ?? [];
        list.push({ id: row.id, platforms: row.platforms });
        groups.set(key, list);
    }

    let groupsMerged = 0;
    let gamesRemoved = 0;

    for (const games of groups.values()) {
        if (games.length < 2) continue;

        // Two same-platform games sharing a title by coincidence aren't a
        // cross-platform match - only merge if multiple platforms are present.
        const platformsInGroup = new Set(games.flatMap((g) => g.platforms));
        if (platformsInGroup.size < 2) continue;

        const [winner, ...losers] = games;
        for (const loser of losers) {
            await mergeGames(winner.id, loser.id);
            gamesRemoved++;
        }
        groupsMerged++;
    }

    return { groupsMerged, gamesRemoved };
}

// Exported for manual merges (matching/routes.ts) - automatic matching above
// only merges on exact normalized title, which deliberately misses genuine
// same-game cases with differently formatted titles across platforms (e.g.
// "Skyrim" on PSN vs "The Elder Scrolls V: Skyrim" on Steam). A human
// confirming those is safer than loosening the automatic match to fuzzy
// title comparison, which risks merging genuinely different games.
export async function mergeGames(winnerId: string, loserId: string): Promise<void> {
    // Defense in depth for the manual-merge route, which takes arbitrary ids
    // from a request body - the automatic path above never pairs a game with
    // itself, but a manual merge could if given the same id twice, and this
    // would otherwise fall through to deleting the row out from under itself.
    if (winnerId === loserId) return;

    const client = await pool.connect();
    try {
        await client.query("begin");
        await client.query("update game_platform_links set game_id = $1 where game_id = $2", [winnerId, loserId]);
        await client.query("update canonical_achievements set game_id = $1 where game_id = $2", [winnerId, loserId]);

        // Repoint ownership, but skip any row that would collide with an
        // owner the winner already has (same account can't own a game twice).
        await client.query(
            `update user_owned_games uog set game_id = $1
             where game_id = $2
               and not exists (
                   select 1 from user_owned_games x
                   where x.user_platform_account_id = uog.user_platform_account_id and x.game_id = $1
               )`,
            [winnerId, loserId]
        );
        await client.query("delete from user_owned_games where game_id = $1", [loserId]);
        await client.query("delete from games where id = $1", [loserId]);
        await client.query("commit");
    } catch (err) {
        await client.query("rollback");
        throw err;
    } finally {
        client.release();
    }
}
