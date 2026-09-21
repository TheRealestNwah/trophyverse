import "dotenv/config";
import { parseCredentialEncryptionKey } from "./security/credentials";

function required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
}

export const config = {
    port: Number(process.env.PORT ?? 3000),
    baseUrl: required("BASE_URL"),
    databaseUrl: required("DATABASE_URL"),
    steamApiKey: required("STEAM_API_KEY"),
    sessionSecret: required("SESSION_SECRET"),
    credentialEncryptionKey: parseCredentialEncryptionKey(required("CREDENTIAL_ENCRYPTION_KEY")),
    trustProxy: process.env.TRUST_PROXY === "true",
    rateLimitWindowMinutes: Number(process.env.RATE_LIMIT_WINDOW_MINUTES ?? 15),
    rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 300),
    authRateLimitMaxRequests: Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS ?? 30),
    // Off by default - see scheduler.ts. Every account already syncs fine
    // on demand from the dashboard; this just automates that.
    schedulerEnabled: process.env.SCHEDULER_ENABLED === "true",
    schedulerIntervalMinutes: Number(process.env.SCHEDULER_INTERVAL_MINUTES ?? 360),
};
