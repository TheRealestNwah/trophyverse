import { Pool } from "pg";
import { config } from "./config";

export const pool = new Pool({ connectionString: config.databaseUrl });

export async function checkDatabaseConnection(): Promise<void> {
    await pool.query("select 1");
}
