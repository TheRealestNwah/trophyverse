import os from "os";
import path from "path";
import { findFreePort, startEmbeddedDatabase } from "./runtime/embeddedDatabase";

// Entry point for the self-contained app: no .env, no external PostgreSQL.
// Everything lives in one per-user data folder.

export function defaultDataDir(): string {
    if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Trophyverse");
    if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Trophyverse");
    return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "trophyverse");
}

export interface RunningApp {
    url: string;
    dataDir: string;
    stop(): Promise<void>;
}

export async function startApp({ dataDir = defaultDataDir(), port }: { dataDir?: string; port?: number } = {}): Promise<RunningApp> {
    const resolvedDataDir = path.resolve(dataDir);
    process.env.TROPHYVERSE_APP = "1";
    process.env.TROPHYVERSE_DATA_DIR = resolvedDataDir;
    process.env.HOST = "127.0.0.1";
    process.env.PORT = String(port ?? (await findFreePort()));
    // Single-user defaults: nobody else is going to press Sync, and one person
    // clicking around can't trip limits meant for a shared public server.
    process.env.SCHEDULER_ENABLED ??= "true";
    process.env.RATE_LIMIT_MAX_REQUESTS ??= "5000";
    process.env.AUTH_RATE_LIMIT_MAX_REQUESTS ??= "300";

    const database = await startEmbeddedDatabase(resolvedDataDir);
    try {
        process.env.DATABASE_URL = database.url;

        // config.ts reads the environment when first imported, so nothing that
        // touches it may load before the variables above are in place.
        const { applySchema } = await import("./db/migrate");
        await applySchema();
        const { startServer } = await import("./index");
        const { config } = await import("./config");
        const server = await startServer({ handleSignals: false });

        let stopping: Promise<void> | undefined;
        return {
            url: config.baseUrl,
            dataDir: resolvedDataDir,
            stop: () => (stopping ??= server.stop().finally(() => database.stop())),
        };
    } catch (err) {
        await database.stop().catch(() => undefined);
        throw err;
    }
}

if (require.main === module) {
    startApp({ dataDir: process.env.TROPHYVERSE_DATA_DIR || undefined, port: Number(process.env.PORT) || undefined })
        .then((app) => {
            console.log(`Trophyverse is running at ${app.url} (data in ${app.dataDir})`);
            const onSignal = () => {
                app.stop()
                    .catch((err) => {
                        console.error("Shutdown failed:", err);
                        process.exitCode = 1;
                    })
                    .finally(() => process.exit());
            };
            process.once("SIGINT", onSignal);
            process.once("SIGTERM", onSignal);
        })
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}
