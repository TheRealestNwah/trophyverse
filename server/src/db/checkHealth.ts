import { checkDatabaseConnection, pool } from "../db";

async function main(): Promise<void> {
    try {
        await checkDatabaseConnection();
        console.log("Database is reachable.");
    } finally {
        await pool.end();
    }
}

main().catch((err) => {
    console.error("Database health check failed:", err);
    process.exitCode = 1;
});
