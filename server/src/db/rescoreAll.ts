import { pool } from "../db";
import { recomputeUserScore } from "../scoring";

// Refreshes every user's cached total_points/level from their existing
// unlocks. total_points is always correct (computed live from unlocks), but
// the cached `level` column only updates on the next recomputeUserScore call
// - needed after any change to level_thresholds (e.g. a re-tuned level
// curve - see db:seed-levels) so stale levels don't linger until a user's
// next sync.
async function main() {
    const users = await pool.query("select id from users");
    for (const user of users.rows) {
        const score = await recomputeUserScore(user.id);
        console.log(user.id, score.totalPoints, "-> level", score.level);
    }
    await pool.end();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
