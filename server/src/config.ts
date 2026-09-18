import "dotenv/config";

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
    // Off by default - see scheduler.ts. Every account already syncs fine
    // on demand from the dashboard; this just automates that.
    schedulerEnabled: process.env.SCHEDULER_ENABLED === "true",
    schedulerIntervalMinutes: Number(process.env.SCHEDULER_INTERVAL_MINUTES ?? 360),
};
