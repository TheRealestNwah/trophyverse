import { pool } from "../db";

// One-off correction for #77: xbox/sync.ts used to label every modern-endpoint
// title "Xbox One/Series", which overclaimed a specific console even for
// achievements earned through the Xbox app on PC (OpenXBL can't tell PC from
// console apart - only modern-vs-360, see the comment in xbox/sync.ts). The
// code fix only changes the label going forward - console_variant is only
// backfilled when null, so already-synced rows keep the old string forever
// without this. Safe to re-run - a no-op once corrected.
async function fixXboxConsoleOverclaim() {
    const result = await pool.query(
        `update game_platform_links
         set console_variant = 'Xbox'
         where platform_id = 'xbox' and console_variant = 'Xbox One/Series'
         returning id`
    );

    console.log(`Corrected ${result.rows.length} overclaimed Xbox console label(s).`);
    await pool.end();
}

fixXboxConsoleOverclaim().catch((err) => {
    console.error(err);
    process.exit(1);
});
