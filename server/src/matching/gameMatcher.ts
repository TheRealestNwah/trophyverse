import { pool } from "../db";
import { normalize, isTitleSubsequenceMatch } from "./normalize";

export interface GameMatchResult {
    groupsMerged: number;
    gamesRemoved: number;
    candidatesRecorded: number;
}

interface GameRow {
    id: string;
    title: string;
    platforms: string[];
}

// Matches platforms.id in schema.sql - not the short "retro" name used
// elsewhere in comments/prose, which isn't the real stored value.
const RETRO_PLATFORM_ID = "retroachievements";

async function fetchGamesWithPlatforms(): Promise<GameRow[]> {
    const rows = await pool.query(`
        select g.id, g.title, array_agg(distinct gpl.platform_id) as platforms
        from games g
        join game_platform_links gpl on gpl.game_id = g.id
        group by g.id, g.title
    `);
    return rows.rows;
}

// Cross-platform game matching, in two passes:
//
// 1. Exact match on normalized title (case, punctuation, trademark symbols
//    stripped) auto-merges, same as before - except when RetroAchievements
//    is one of the platforms involved. RA only covers older/classic-system
//    titles, so an exact-title match that includes it carries a real,
//    structural risk a same-generation match doesn't: a modern remake or
//    remaster sharing its original's exact name (Resident Evil 2 1998 vs.
//    the 2019 remake, both just "Resident Evil 2" - see #73). Those go to
//    the review queue instead, while any other exact-title platforms in the
//    same group still merge automatically as before.
// 2. A near-title-match pass across everything left (different normalized
//    titles) also goes to the review queue rather than either auto-merging
//    on a fuzzy match (risks merging genuinely different games - see
//    mergeGames' own comment below) or leaving it unmatched forever, which
//    is what happened before this existed (#76: "Grand Theft Auto V" vs.
//    "Grand Theft Auto V: Legacy", or a short colloquial title vs. the full
//    official name on another platform). Uses isTitleSubsequenceMatch
//    (see normalize.ts) rather than a word-overlap score - a plain shared-
//    word score can't tell "same title plus an appended suffix" from "same
//    franchise prefix, different sequel," and produced hundreds of
//    false-positive pairs (two unrelated sequels sharing just a number, or a
//    franchise's games sharing their first few words) when tried against
//    this app's real data.
export async function matchGames(): Promise<GameMatchResult> {
    const initialGames = await fetchGamesWithPlatforms();

    const groups = new Map<string, GameRow[]>();
    for (const game of initialGames) {
        const key = normalize(game.title);
        const list = groups.get(key) ?? [];
        list.push(game);
        groups.set(key, list);
    }

    let groupsMerged = 0;
    let gamesRemoved = 0;
    let candidatesRecorded = 0;

    for (const group of groups.values()) {
        if (group.length < 2) continue;

        // Two same-platform games sharing a title by coincidence aren't a
        // cross-platform match - only merge if multiple platforms are present.
        const platformsInGroup = new Set(group.flatMap((g) => g.platforms));
        if (platformsInGroup.size < 2) continue;

        const retroGames = group.filter((g) => g.platforms.includes(RETRO_PLATFORM_ID));
        const safeGames = group.filter((g) => !g.platforms.includes(RETRO_PLATFORM_ID));

        let winner: GameRow;
        if (safeGames.length > 0) {
            winner = safeGames[0];
            for (const loser of safeGames.slice(1)) {
                await mergeGames(winner.id, loser.id);
                gamesRemoved++;
            }
            if (safeGames.length > 1) groupsMerged++;
        } else {
            winner = retroGames[0];
        }

        // Everything else sharing this exact title with the (now-merged)
        // winner that involves retro: winner itself if it's a retro game.
        const retroToReview = safeGames.length > 0 ? retroGames : retroGames.slice(1);
        for (const retroGame of retroToReview) {
            const created = await recordGameCandidate(winner.id, retroGame.id, 0.99, "exact-title-retro");
            if (created) candidatesRecorded++;
        }
    }

    // Re-fetch rather than reuse initialGames - the merges above changed
    // which game ids exist, and near-title matching should compare today's
    // canonical games, not a pre-merge snapshot.
    const currentGames = await fetchGamesWithPlatforms();
    for (let i = 0; i < currentGames.length; i++) {
        for (let j = i + 1; j < currentGames.length; j++) {
            const a = currentGames[i];
            const b = currentGames[j];
            if (normalize(a.title) === normalize(b.title)) continue; // handled above
            if (a.platforms.some((p) => b.platforms.includes(p))) continue; // same-platform title collision, not a cross-platform candidate
            if (!isTitleSubsequenceMatch(a.title, b.title)) continue;

            const created = await recordGameCandidate(a.id, b.id, 0.75, "near-title-match");
            if (created) candidatesRecorded++;
        }
    }

    return { groupsMerged, gamesRemoved, candidatesRecorded };
}

// Idempotent: a pair already recorded (pending, confirmed, or rejected)
// isn't re-inserted, so a rejected suggestion doesn't keep coming back every
// time matching runs, and re-running doesn't spam duplicate pending rows.
// Always stores the pair with the lexicographically smaller id first so the
// unique constraint catches it regardless of which side was compared first.
async function recordGameCandidate(gameAId: string, gameBId: string, confidence: number, reason: string): Promise<boolean> {
    const [first, second] = [gameAId, gameBId].sort();
    const result = await pool.query(
        `insert into game_merge_candidates (game_a_id, game_b_id, confidence, reason)
         values ($1, $2, $3, $4)
         on conflict (game_a_id, game_b_id) do nothing
         returning id`,
        [first, second, confidence, reason]
    );
    return result.rows.length > 0;
}

// Exported for manual merges (matching/routes.ts) and for confirming a
// game_merge_candidate below - automatic matching above only merges on
// exact normalized title (minus the retro exception), which deliberately
// misses genuine same-game cases with differently formatted titles across
// platforms. A human confirming those, via the review queue or a manual
// "Link games" pairing, is safer than loosening the automatic match to
// fuzzy title comparison, which risks merging genuinely different games.
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

        // Repoint absence streaks the same way (see #58) - without this, the
        // games row's on-delete-cascade FK would just wipe the loser's
        // streak, silently resetting a genuinely-removed game's reconciliation
        // clock to zero any time a routine cross-platform match merges it.
        // On a collision (same account has a streak row for both games
        // already), keep the higher streak rather than either row's value.
        await client.query(
            `update game_absence_streaks winner
             set consecutive_missing_syncs = greatest(winner.consecutive_missing_syncs, loser.consecutive_missing_syncs)
             from game_absence_streaks loser
             where loser.game_id = $2
               and winner.game_id = $1
               and winner.user_platform_account_id = loser.user_platform_account_id`,
            [winnerId, loserId]
        );
        await client.query(
            `update game_absence_streaks gas set game_id = $1
             where game_id = $2
               and not exists (
                   select 1 from game_absence_streaks x
                   where x.user_platform_account_id = gas.user_platform_account_id and x.game_id = $1
               )`,
            [winnerId, loserId]
        );
        await client.query("delete from game_absence_streaks where game_id = $1", [loserId]);

        await client.query("delete from games where id = $1", [loserId]);
        await client.query("commit");
    } catch (err) {
        await client.query("rollback");
        throw err;
    } finally {
        client.release();
    }
}

// Manual review actions for game-merge candidates left by matchGames above -
// a human decides instead of an automatic merge. Mirrors
// achievementMatcher's confirmMatchCandidate/rejectMatchCandidate.
export async function confirmGameMergeCandidate(candidateId: string): Promise<void> {
    const candidate = await pool.query("select game_a_id, game_b_id from game_merge_candidates where id = $1", [
        candidateId,
    ]);
    if (!candidate.rows[0]) throw new Error("Game merge candidate not found");

    await mergeGames(candidate.rows[0].game_a_id, candidate.rows[0].game_b_id);
    await pool.query("update game_merge_candidates set status = 'confirmed', reviewed_at = now() where id = $1", [
        candidateId,
    ]);
}

export async function rejectGameMergeCandidate(candidateId: string): Promise<void> {
    await pool.query("update game_merge_candidates set status = 'rejected', reviewed_at = now() where id = $1", [
        candidateId,
    ]);
}
