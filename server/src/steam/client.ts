import { config } from "../config";

const BASE_URL = "https://api.steampowered.com";

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    url.searchParams.set("key", config.steamApiKey);
    url.searchParams.set("format", "json");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Steam API ${path} failed: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
}

export interface OwnedGame {
    appid: number;
    name: string;
    playtime_forever: number;
}

export async function getOwnedGames(steamId: string): Promise<OwnedGame[]> {
    const data = await get<{ response: { games?: OwnedGame[] } }>(
        "/IPlayerService/GetOwnedGames/v1/",
        { steamid: steamId, include_appinfo: "1", include_played_free_games: "1" }
    );
    return data.response.games ?? [];
}

export interface GameAchievementSchema {
    name: string; // api name, matches achievement_platform_links.platform_achievement_id
    displayName: string;
    description?: string;
}

export async function getSchemaForGame(appId: number): Promise<GameAchievementSchema[]> {
    const data = await get<{
        game?: {
            availableGameStats?: {
                achievements?: Array<{ name: string; displayName: string; description?: string }>;
            };
        };
    }>("/ISteamUserStats/GetSchemaForGame/v2/", { appid: String(appId) });

    const achievements = data.game?.availableGameStats?.achievements ?? [];
    return achievements.map((a) => ({
        name: a.name,
        displayName: a.displayName,
        description: a.description,
    }));
}

export interface PlayerAchievement {
    apiname: string;
    achieved: 0 | 1;
    unlocktime: number;
}

export async function getPlayerAchievements(
    appId: number,
    steamId: string
): Promise<PlayerAchievement[]> {
    try {
        const data = await get<{ playerstats: { achievements?: PlayerAchievement[]; success: boolean } }>(
            "/ISteamUserStats/GetPlayerAchievements/v1/",
            { appid: String(appId), steamid: steamId }
        );
        return data.playerstats.achievements ?? [];
    } catch {
        // Games with no stats/achievements, or a private profile, 400/403 here.
        return [];
    }
}

export async function getGlobalAchievementPercentages(
    appId: number
): Promise<Map<string, number>> {
    try {
        const data = await get<{
            achievementpercentages: { achievements: Array<{ name: string; percent: number }> };
        }>("/ISteamUserStats/GetGlobalAchievementPercentagesForGame/v2/", {
            gameid: String(appId),
        });
        return new Map(data.achievementpercentages.achievements.map((a) => [a.name, a.percent]));
    } catch {
        return new Map();
    }
}
