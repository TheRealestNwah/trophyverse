import { pool } from "../db";
import { normalizeRarityTiersForAllGames } from "../scoring/rarityNormalization";
import { recomputeUserScore } from "../scoring";

// One-off correction for data written before per-game percentile tiering
// (see rarityNormalization.ts, issue #10): games with a skewed
// rarity_fallback achievement distribution (e.g. Payday 2, median 5.7%
// unlock rate) were tiered entirely off fixed global thresholds, collapsing
// nearly everything into gold. Safe to re-run - a no-op once corrected.
async function fixRarityTiering() {
    const { gamesChanged } = await normalizeRarityTiersForAllGames();
    console.log(`Re-tiered achievements in ${gamesChanged} game(s).`);

    if (gamesChanged > 0) {
        const users = await pool.query("select id from users");
        for (const user of users.rows) await recomputeUserScore(user.id);
        console.log(`Rescored ${users.rows.length} user(s).`);
    }

    await pool.end();
}

fixRarityTiering().catch((err) => {
    console.error(err);
    process.exit(1);
});
