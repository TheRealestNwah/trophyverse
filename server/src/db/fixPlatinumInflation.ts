import { pool } from "../db";
import { resolveTierFromRarity } from "../scoring/tier";
import { recomputeUserScore } from "../scoring";

// One-off correction for data written before the platinum-cap fix to
// resolveTierFromRarity: any achievement tiered 'platinum' via a rarity
// guess (never a real PSN trophy) gets recomputed from its rarity data,
// which now caps out at gold. Safe to re-run - a no-op once corrected.
async function fixPlatinumInflation() {
    const rows = await pool.query(
        `select ca.id,
                (select min(global_unlock_rarity) from achievement_platform_links where canonical_achievement_id = ca.id) as min_rarity
         from canonical_achievements ca
         where ca.tier = 'platinum' and ca.tier_source = 'rarity_fallback'`
    );

    let corrected = 0;
    for (const row of rows.rows) {
        const { tier, points } = resolveTierFromRarity(row.min_rarity != null ? Number(row.min_rarity) : undefined);
        await pool.query("update canonical_achievements set tier = $1, points = $2 where id = $3", [
            tier,
            points,
            row.id,
        ]);
        corrected++;
    }

    console.log(`Corrected ${corrected} wrongly-platinum achievement(s).`);

    if (corrected > 0) {
        const users = await pool.query("select id from users");
        for (const user of users.rows) await recomputeUserScore(user.id);
        console.log(`Rescored ${users.rows.length} user(s).`);
    }

    await pool.end();
}

fixPlatinumInflation().catch((err) => {
    console.error(err);
    process.exit(1);
});
