import dotenv from "dotenv";
import path from "path";
import { parseCredentialEncryptionKey } from "./security/credentials";
import { loadOrCreateSecrets } from "./runtime/secrets";

// The self-contained app (app.ts) never reads a .env: everything it needs is
// generated or passed in, so a stray .env in the working directory can't
// point it at some other database.
if (process.env.TROPHYVERSE_APP !== "1") dotenv.config();

function required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
}

// Set by the desktop app to its per-user data folder. When present, secrets
// are generated there on first run and uploads live there instead of inside
// the (read-only once installed) app bundle.
const dataDir = process.env.TROPHYVERSE_DATA_DIR ? path.resolve(process.env.TROPHYVERSE_DATA_DIR) : undefined;
const generatedSecrets = dataDir ? loadOrCreateSecrets(dataDir) : undefined;
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST || undefined;
// Must match the host the browser actually uses: session cookies for
// localhost and 127.0.0.1 are separate, so a mismatched Steam return URL
// would silently drop the login.
const defaultBaseHost = !host || host === "0.0.0.0" || host === "::" ? "localhost" : host.includes(":") ? `[${host}]` : host;

export const config = {
    port,
    host,
    baseUrl: process.env.BASE_URL || `http://${defaultBaseHost}:${port}`,
    dataDir,
    uploadsDir: dataDir ? path.join(dataDir, "uploads") : path.join(__dirname, "..", "public", "uploads"),
    databaseUrl: required("DATABASE_URL"),
    // Optional: without it the dashboard asks the user for their own key on
    // first run and stores it encrypted (see settings/steamApiKey.ts).
    steamApiKey: process.env.STEAM_API_KEY || undefined,
    sessionSecret: process.env.SESSION_SECRET || generatedSecrets?.sessionSecret || required("SESSION_SECRET"),
    credentialEncryptionKey: parseCredentialEncryptionKey(
        process.env.CREDENTIAL_ENCRYPTION_KEY || generatedSecrets?.credentialEncryptionKey || required("CREDENTIAL_ENCRYPTION_KEY")
    ),
    trustProxy: process.env.TRUST_PROXY === "true",
    rateLimitWindowMinutes: Number(process.env.RATE_LIMIT_WINDOW_MINUTES ?? 15),
    rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 300),
    authRateLimitMaxRequests: Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS ?? 30),
    // Off by default - see scheduler.ts. Every account already syncs fine
    // on demand from the dashboard; this just automates that.
    schedulerEnabled: process.env.SCHEDULER_ENABLED === "true",
    schedulerIntervalMinutes: Number(process.env.SCHEDULER_INTERVAL_MINUTES ?? 360),
};
