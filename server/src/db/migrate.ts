import fs from "fs";
import path from "path";
import { pool } from "../db";
import { generateLevelThresholds } from "../scoring/levelCurve";

export async function seedLevelThresholds() {
    const thresholds = generateLevelThresholds();
    const values = thresholds.map((t) => `(${t.level}, ${t.pointsRequired})`).join(",");
    await pool.query(`
        insert into level_thresholds (level, points_required)
        values ${values}
        on conflict (level) do update set points_required = excluded.points_required
    `);
    console.log(`Seeded ${thresholds.length} level thresholds.`);
}

async function migrate() {
    const schemaPath = path.join(__dirname, "..", "..", "..", "db", "schema.sql");
    const sql = fs.readFileSync(schemaPath, "utf-8");
    await pool.query(sql);
    console.log("Schema applied.");
    await seedLevelThresholds();
    await pool.end();
}

if (require.main === module) {
    migrate().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
