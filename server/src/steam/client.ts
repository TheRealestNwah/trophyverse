import { getSteamApiKey } from "../settings/steamApiKey";

const BASE_URL = "https://api.steampowered.com";

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    url.searchParams.set("key", getSteamApiKey());
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
    rtime_last_played: number;
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
    iconUrl?: string;
}

export async function getSchemaForGame(appId: number): Promise<GameAchievementSchema[]> {
    const data = await get<{
        game?: {
            availableGameStats?: {
                achievements?: Array<{ name: string; displayName: string; description?: string; icon?: string }>;
            };
        };
    }>("/ISteamUserStats/GetSchemaForGame/v2/", { appid: String(appId) });

    const achievements = data.game?.availableGameStats?.achievements ?? [];
    return achievements.map((a) => ({
        name: a.name,
        displayName: a.displayName,
        description: a.description,
        iconUrl: a.icon,
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
        }>("/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/", {
            gameid: String(appId),
        });
        return new Map(data.achievementpercentages.achievements.map((a) => [a.name, a.percent]));
    } catch {
        return new Map();
    }
}

export interface SteamSearchResult {
    id: number;
    name: string;
    type: string;
}

// The store's own public search endpoint - a different host from the rest of
// this client (store.steampowered.com, not api.steampowered.com) and needs
// no API key. Used to look up a game's appid from just its title, for cases
// where no user has actually linked/synced Steam for this game (see
// matching/steamCatalogEnrichment.ts). ISteamApps/GetAppList, the obvious
// alternative, no longer exists (confirmed live: 404 across every documented
// version) - this search endpoint is the one that's actually there.
export async function searchApps(term: string): Promise<SteamSearchResult[]> {
    const url = new URL("https://store.steampowered.com/api/storesearch/");
    url.searchParams.set("term", term);
    url.searchParams.set("cc", "us");
    url.searchParams.set("l", "en");

    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: SteamSearchResult[] };
    return data.items ?? [];
}
