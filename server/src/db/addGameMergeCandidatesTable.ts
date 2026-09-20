import { pool } from "../db";

// One-off schema update for #73/#76: db:migrate only applies schema.sql to a
// fresh database (every statement is a plain `create table`, not `if not
// exists`, so re-running it against an already-migrated database errors on
// every table that already exists). This applies just the new table schema.sql
// gained for the game-merge review queue, safe to re-run against a database
// that already has it.
async function addGameMergeCandidatesTable() {
    await pool.query(`
        create table if not exists game_merge_candidates (
            id              uuid primary key default uuid_generate_v4(),
            game_a_id       uuid not null references games(id) on delete cascade,
            game_b_id       uuid not null references games(id) on delete cascade,
            confidence      numeric(3,2) not null,
            reason          text not null,
            status          match_status not null default 'pending',
            reviewed_at     timestamptz,
            unique (game_a_id, game_b_id)
        )
    `);
    console.log("game_merge_candidates table is present.");
    await pool.end();
}

addGameMergeCandidatesTable().catch((err) => {
    console.error(err);
    process.exit(1);
});
