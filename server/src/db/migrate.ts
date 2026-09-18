import fs from "fs";
import path from "path";
import { pool } from "../db";

async function migrate() {
    const schemaPath = path.join(__dirname, "..", "..", "..", "db", "schema.sql");
    const sql = fs.readFileSync(schemaPath, "utf-8");
    await pool.query(sql);
    console.log("Schema applied.");
    await pool.end();
}

migrate().catch((err) => {
    console.error(err);
    process.exit(1);
});
