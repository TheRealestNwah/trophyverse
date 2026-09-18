import { pool } from "../db";

export interface UserScore {
    totalPoints: number;
    level: number;
    pointsForCurrentLevel: number;
    pointsForNextLevel: number | null; // null once MAX_LEVEL is reached
}

// Recomputes a user's total points from their deduplicated unlocks (the same
// achievement counts once even if earned on two linked platforms) and caches
// the result in user_scores. Call this after any sync that adds unlocks.
export async function recomputeUserScore(userId: string): Promise<UserScore> {
    const totalResult = await pool.query(
        "select coalesce(sum(points), 0) as total from user_canonical_unlocks where user_id = $1",
        [userId]
    );
    const totalPoints = Number(totalResult.rows[0].total);

    const levelResult = await pool.query(
        "select level from level_thresholds where points_required <= $1 order by level desc limit 1",
        [totalPoints]
    );
    const level = levelResult.rows[0]?.level ?? 1;

    await pool.query(
        `insert into user_scores (user_id, total_points, level, computed_at)
         values ($1, $2, $3, now())
         on conflict (user_id) do update
            set total_points = excluded.total_points,
                level = excluded.level,
                computed_at = excluded.computed_at`,
        [userId, totalPoints, level]
    );

    return getScoreBreakdown(totalPoints, level);
}

export async function getUserScore(userId: string): Promise<UserScore> {
    const result = await pool.query(
        "select total_points, level from user_scores where user_id = $1",
        [userId]
    );
    if (!result.rows[0]) return getScoreBreakdown(0, 1);
    return getScoreBreakdown(Number(result.rows[0].total_points), result.rows[0].level);
}

async function getScoreBreakdown(totalPoints: number, level: number): Promise<UserScore> {
    const currentThreshold = await pool.query(
        "select points_required from level_thresholds where level = $1",
        [level]
    );
    const nextThreshold = await pool.query(
        "select points_required from level_thresholds where level = $1",
        [level + 1]
    );
    return {
        totalPoints,
        level,
        pointsForCurrentLevel: Number(currentThreshold.rows[0]?.points_required ?? 0),
        pointsForNextLevel: nextThreshold.rows[0] ? Number(nextThreshold.rows[0].points_required) : null,
    };
}
