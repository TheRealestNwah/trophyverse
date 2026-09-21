import { pool } from "../db";
import { matchAchievementsForGame } from "../matching/achievementMatcher";
import { normalizeRarityTiersForGame } from "../scoring/rarityNormalization";
import { recomputeUserScore } from "../scoring";

// One-off correction for a bad merge predating #76's matchGames fix: PSN
// reports the Skyrim Special Edition trophy list (NPWR25780_00, a
// PS4/PS5-only release - the 2011 original never shipped on those consoles)
// under the same bare title "Skyrim" as the original game's own PSN trophy
// list, and an earlier manual merge grouped them into one canonical game
// instead of joining the real "Skyrim Special Edition" group that Steam and
// Xbox already share. Every shared achievement got fused pairwise into one
// canonical_achievements row per trophy (PS3 original + PS5 remaster each
// linked to the same row). This splits the PS5 trophy list's
// game_platform_link back out, gives it its own copy of every previously-
// fused canonical_achievements row, and reattaches it to the Special Edition
// canonical game. Existing unlocks aren't touched - user_achievement_unlocks
// is keyed by achievement_platform_links.id, which this never changes, only
// repoints to a different canonical_achievement_id.
const SOURCE_PSN_PLATFORM_GAME_ID = "NPWR25780_00";
const SOURCE_TITLE = "The Elder Scrolls V: Skyrim";
const TARGET_TITLE = "The Elder Scrolls V: Skyrim Special Edition";

async function main() {
    const client = await pool.connect();
    let split = 0;
    let targetGameId: string;
    try {
        await client.query("begin");

        const sourceGame = await client.query("select id from games where title = $1", [SOURCE_TITLE]);
        const targetGame = await client.query("select id from games where title = $1", [TARGET_TITLE]);
        if (!sourceGame.rows[0] || !targetGame.rows[0]) {
            throw new Error("Expected both Skyrim canonical games to already exist - nothing to split.");
        }
        const sourceGameId: string = sourceGame.rows[0].id;
        targetGameId = targetGame.rows[0].id;

        const link = await client.query(
            "select id, game_id from game_platform_links where platform_id = 'psn' and platform_game_id = $1",
            [SOURCE_PSN_PLATFORM_GAME_ID]
        );
        if (!link.rows[0]) {
            throw new Error("Expected the PSN Skyrim Special Edition trophy list to exist - nothing to split.");
        }
        const linkId: string = link.rows[0].id;
        if (link.rows[0].game_id === sourceGameId) {
            await client.query("update game_platform_links set game_id = $1 where id = $2", [targetGameId, linkId]);

            const achievementLinks = await client.query(
                `select id, canonical_achievement_id from achievement_platform_links
                 where platform_id = 'psn' and platform_game_id = $1`,
                [SOURCE_PSN_PLATFORM_GAME_ID]
            );

            for (const row of achievementLinks.rows) {
                const canonical = await client.query(
                    "select game_id, name, description, tier, tier_source, points, icon_url from canonical_achievements where id = $1",
                    [row.canonical_achievement_id]
                );
                const c = canonical.rows[0];
                if (c.game_id === targetGameId) continue;

                const otherLinks = await client.query(
                    "select 1 from achievement_platform_links where canonical_achievement_id = $1 and id != $2",
                    [row.canonical_achievement_id, row.id]
                );
                if (otherLinks.rows.length === 0) {
                    // Not actually fused with anything else - just move it directly.
                    await client.query("update canonical_achievements set game_id = $1 where id = $2", [
                        targetGameId,
                        row.canonical_achievement_id,
                    ]);
                    split++;
                    continue;
                }

                const created = await client.query(
                    `insert into canonical_achievements (game_id, name, description, tier, tier_source, points, icon_url)
                     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
                    [targetGameId, c.name, c.description, c.tier, c.tier_source, c.points, c.icon_url]
                );
                await client.query("update achievement_platform_links set canonical_achievement_id = $1 where id = $2", [
                    created.rows[0].id,
                    row.id,
                ]);
                split++;
            }

            // A source-game ownership row alone cannot tell whether an account
            // owns the original release or Special Edition. Only copy ownership
            // where an unlock from this exact Special Edition trophy list proves it.
            await client.query(
                `insert into user_owned_games (user_platform_account_id, game_id)
                 select distinct uau.user_platform_account_id, $1
                 from user_achievement_unlocks uau
                 join achievement_platform_links apl on apl.id = uau.achievement_platform_link_id
                 where apl.platform_id = 'psn' and apl.platform_game_id = $2
                 on conflict (user_platform_account_id, game_id) do nothing`,
                [targetGameId, SOURCE_PSN_PLATFORM_GAME_ID]
            );
        } else if (link.rows[0].game_id !== targetGameId) {
            throw new Error("PSN Skyrim Special Edition trophy list belongs to an unexpected canonical game.");
        }

        await client.query("commit");
    } catch (err) {
        await client.query("rollback");
        throw err;
    } finally {
        client.release();
    }

    // Finish the repair after the structural transaction commits. This is
    // deliberately repeatable: if a prior run moved the link but failed here,
    // a later run still re-matches, normalizes, and rescales the affected data.
    const matchResult = await matchAchievementsForGame(targetGameId);
    await normalizeRarityTiersForGame(targetGameId);
    const affectedUsers = await pool.query(
        `select distinct upa.user_id
         from user_platform_accounts upa
         join user_owned_games uog on uog.user_platform_account_id = upa.id
         where uog.game_id = $1
         union
         select distinct upa.user_id
         from user_achievement_unlocks uau
         join user_platform_accounts upa on upa.id = uau.user_platform_account_id
         join achievement_platform_links apl on apl.id = uau.achievement_platform_link_id
         where apl.platform_id = 'psn' and apl.platform_game_id = $2`,
        [targetGameId, SOURCE_PSN_PLATFORM_GAME_ID]
    );
    for (const user of affectedUsers.rows) await recomputeUserScore(user.user_id);

    console.log(
        `Moved PSN Special Edition trophy list and split ${split} canonical achievements; re-merged ${matchResult.merged} achievements and rescored ${affectedUsers.rows.length} users.`
    );
    await pool.end();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
