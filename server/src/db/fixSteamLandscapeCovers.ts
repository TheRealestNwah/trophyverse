import { pool } from "../db";

// One-off correction for the dashboard's cover box switching to a portrait
// 2:3 shape (see #19-era steam/sync.ts change): existing games already had
// cover_image_url populated with Steam's landscape header.jpg, and
// getOrCreateCanonicalGame only backfills a cover when it's null, so they'd
// never pick up the new portrait library_600x900.jpg on their own. Clears
// the old value so the next Steam sync repopulates it - never touches
// user_game_cover_overrides, which already takes precedence over this
// column regardless. Safe to re-run - a no-op once corrected.
async function fixSteamLandscapeCovers() {
    const result = await pool.query(
        "update games set cover_image_url = null where cover_image_url like '%/header.jpg' returning id"
    );
    console.log(`Cleared ${result.rows.length} landscape cover(s) for repopulation.`);
    await pool.end();
}

fixSteamLandscapeCovers().catch((err) => {
    console.error(err);
    process.exit(1);
});
