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
    // Optional: the Steam-only setup keeps working without these. Only
    // hitting an /auth/xbox route requires them to actually be set.
    xboxClientId: process.env.XBOX_CLIENT_ID,
    xboxClientSecret: process.env.XBOX_CLIENT_SECRET,
};
