const BASE_URL = "https://retroachievements.org/API";

export class RetroApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

// RetroAchievements has no OAuth - every call is authenticated with a
// per-account Web API key (generated at retroachievements.org/settings)
// plus the target username, both passed as query params. A bad key/user
// combination doesn't reliably come back as a 401/404 - it's often a 200
// with an empty body or an empty JSON object, so callers check the parsed
// shape themselves rather than trusting the HTTP status alone.
async function get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${BASE_URL}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url);
    if (res.status === 401 || res.status === 403) {
        throw new RetroApiError(res.status, "RetroAchievements rejected that username/API key combination");
    }
    if (!res.ok) {
        throw new RetroApiError(res.status, `RetroAchievements API ${path} failed: ${res.status}`);
    }

    const text = await res.text();
    if (!text) {
        throw new RetroApiError(401, "RetroAchievements returned an empty response - check the username and API key");
    }
    try {
        return JSON.parse(text) as T;
    } catch {
        throw new RetroApiError(502, `RetroAchievements API ${path} returned a non-JSON response`);
    }
}

export interface RetroAccount {
    username: string;
    totalPoints: number;
}

// Used to validate a username/API key pair at connect time - GetUserSummary
// returns an object with no User field for an account that doesn't exist,
// rather than a 404. Confirmed against the real API: the field is "User",
// not "Username" as RA's docs' own field-naming convention elsewhere would
// suggest - caught by testing against a real account rather than trusting
// the docs.
export async function verifyAccount(username: string, apiKey: string): Promise<RetroAccount> {
    const data = await get<{ User?: string; TotalPoints?: number }>("API_GetUserSummary.php", {
        u: username,
        y: apiKey,
    });
    if (!data.User) {
        throw new RetroApiError(404, `RetroAchievements user "${username}" not found`);
    }
    return { username: data.User, totalPoints: data.TotalPoints ?? 0 };
}

export interface RetroGameSummary {
    gameId: string;
    title: string;
}

interface RawCompletedGame {
    GameID: number;
    Title: string;
}

// Returns one entry per game the user has ever earned an achievement in.
// The API lists softcore and hardcore progress as separate rows for the
// same GameID, so this dedupes down to one row per game - hardcore vs.
// softcore doesn't matter for what we track (an achievement is either
// unlocked or it isn't).
export async function getUserGames(username: string, apiKey: string): Promise<RetroGameSummary[]> {
    const data = await get<RawCompletedGame[]>("API_GetUserCompletedGames.php", { u: username, y: apiKey });

    const byId = new Map<string, string>();
    for (const g of data) byId.set(String(g.GameID), g.Title);
    return [...byId.entries()].map(([gameId, title]) => ({ gameId, title }));
}

export interface RetroAchievement {
    id: string;
    name: string;
    description: string;
    isUnlocked: boolean;
    unlockedAt?: string;
    globalUnlockRarity?: number;
}

interface RawAchievement {
    ID: number;
    Title: string;
    Description: string;
    NumAwarded: number;
    DateEarned?: string;
    DateEarnedHardcore?: string;
}

interface RawGameProgress {
    NumDistinctPlayersCasual?: number | string;
    Achievements?: Record<string, RawAchievement>;
}

// No native tiers here (RetroAchievements has its own point/"retro ratio"
// system, not PSN-style tiers - see db/schema.sql, has_native_tiers=false),
// so every achievement is scored the same way Steam/Xbox's are: tier
// inferred from global unlock rarity. NumDistinctPlayersCasual is the closest
// analog to Steam's "global achievement percentages" denominator.
export async function getGameProgress(
    username: string,
    apiKey: string,
    gameId: string
): Promise<RetroAchievement[]> {
    const data = await get<RawGameProgress>("API_GetGameInfoAndUserProgress.php", {
        u: username,
        y: apiKey,
        g: gameId,
    });

    const totalPlayers = Number(data.NumDistinctPlayersCasual ?? 0);
    const achievements = Object.values(data.Achievements ?? {});

    return achievements.map((a) => ({
        id: String(a.ID),
        name: a.Title,
        description: a.Description,
        isUnlocked: Boolean(a.DateEarned || a.DateEarnedHardcore),
        unlockedAt: a.DateEarnedHardcore ?? a.DateEarned,
        globalUnlockRarity: totalPlayers > 0 ? (a.NumAwarded / totalPlayers) * 100 : undefined,
    }));
}
