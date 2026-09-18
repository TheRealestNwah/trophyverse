import { pool } from "../db";
import { matchGames } from "./gameMatcher";
import { matchAchievementsForAllGames } from "./achievementMatcher";
import { recomputeUserScore } from "../scoring";
import { normalizeRarityTiersForAllGames } from "../scoring/rarityNormalization";

export interface MatchingSummary {
    gameGroupsMerged: number;
    gamesRemoved: number;
    achievementsMerged: number;
    achievementCandidatesRecorded: number;
    usersRescored: number;
}

// Global maintenance job, not a per-user action: operates on the shared
// canonical tables, so it runs across every user's data at once. Merging
// achievements changes how many distinct canonical achievements exist, so
// every user's cached score is recomputed afterward.
export async function runMatching(): Promise<MatchingSummary> {
    const gameResult = await matchGames();
    const achievementResult = await matchAchievementsForAllGames();

    // Merges can shift a game's rarity_fallback achievement set (fewer,
    // combined rows), so re-check every game for the skew that drives
    // per-game percentile tiering (see rarityNormalization.ts, issue #10)
    // before scores are recomputed below.
    await normalizeRarityTiersForAllGames();

    const users = await pool.query("select id from users");
    for (const user of users.rows) {
        await recomputeUserScore(user.id);
    }

    return {
        gameGroupsMerged: gameResult.groupsMerged,
        gamesRemoved: gameResult.gamesRemoved,
        achievementsMerged: achievementResult.achievementsMerged,
        achievementCandidatesRecorded: achievementResult.candidatesRecorded,
        usersRescored: users.rows.length,
    };
}
