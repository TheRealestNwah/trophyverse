import https from "https";

const BASE_URL = "https://api.xbl.io";

class XboxApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

// Deliberately not using Node's global fetch (undici) here: against
// api.xbl.io it reproducibly gets back an HTTP 200 wrapping a `code: 400`
// error body, while an identical request via Node's https module or curl
// succeeds - some incompatibility between undici's request internals and
// OpenXBL's server, not a real error. Steam's client is unaffected, so only
// this module needs the workaround.
function rawGet(apiKey: string, path: string): Promise<{ status: number; body: string; retryAfter?: string }> {
    return new Promise((resolve, reject) => {
        https
            .get(`${BASE_URL}${path}`, { headers: { "X-Authorization": apiKey } }, (res) => {
                let data = "";
                res.on("data", (chunk) => (data += chunk));
                res.on("end", () =>
                    resolve({
                        status: res.statusCode ?? 0,
                        body: data,
                        retryAfter: res.headers["retry-after"] as string | undefined,
                    })
                );
            })
            .on("error", reject);
    });
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_RETRIES = 3;

// OpenXBL is a thin proxy in front of Microsoft's own Xbox Live rate limits
// (per their docs: tight per-service burst/sustain windows), so a real sync
// making dozens of calls can legitimately hit a 429 mid-run. Retry with
// backoff honoring Retry-After rather than failing the whole sync.
async function get<T>(apiKey: string, path: string, attempt = 1): Promise<T> {
    const res = await rawGet(apiKey, path);

    if (res.status === 429 && attempt <= MAX_RETRIES) {
        const waitSeconds = res.retryAfter ? Number(res.retryAfter) : attempt * 2;
        await sleep(waitSeconds * 1000);
        return get<T>(apiKey, path, attempt + 1);
    }

    if (res.status === 401) throw new XboxApiError(401, "Invalid OpenXBL API key");
    if (res.status < 200 || res.status >= 300) {
        throw new XboxApiError(res.status, `OpenXBL ${path} failed: ${res.status}`);
    }

    const body = JSON.parse(res.body) as { content: T; code: number; message?: string };
    if (body.code !== 200) {
        throw new XboxApiError(body.code, body.message ?? `OpenXBL ${path} returned code ${body.code}`);
    }
    return body.content;
}

export { XboxApiError };

export interface XboxAccount {
    xuid: string;
    gamertag: string;
    gamerscore: number;
}

export async function getAccount(apiKey: string): Promise<XboxAccount> {
    const content = await get<{
        profileUsers: Array<{ id: string; settings: Array<{ id: string; value: string }> }>;
    }>(apiKey, "/v2/account");
    const profile = content.profileUsers[0];
    const setting = (id: string) => profile.settings.find((s) => s.id === id)?.value ?? "";
    return {
        xuid: profile.id,
        gamertag: setting("Gamertag"),
        gamerscore: Number(setting("Gamerscore") || 0),
    };
}

export interface XboxTitleSummary {
    titleId: string;
    name: string;
    totalAchievements: number;
}

// /v2/achievements ("achievements grouped by title") actually returns the
// same title-with-progress-summary shape as /v2/titles - no per-achievement
// detail despite what the docs' example implies. Use it just to find which
// titles have achievements worth fetching individually.
export async function getTitles(apiKey: string): Promise<XboxTitleSummary[]> {
    const content = await get<{
        titles: Array<{ titleId: string; name: string; achievement?: { totalAchievements: number } }>;
    }>(apiKey, "/v2/achievements");

    return content.titles.map((t) => ({
        titleId: t.titleId,
        name: t.name,
        totalAchievements: t.achievement?.totalAchievements ?? 0,
    }));
}

export interface XboxAchievement {
    id: string;
    name: string;
    description: string;
    isUnlocked: boolean;
    timeUnlocked?: string;
    gamerscore: number;
    rarityPercent?: number;
}

interface RawXboxAchievement {
    id: string;
    name: string;
    description: string;
    progressState: string;
    progression?: { timeUnlocked?: string };
    rewards?: Array<{ type: string; value: string }>;
    rarity?: { currentPercentage?: number };
}

function mapAchievement(a: RawXboxAchievement): XboxAchievement {
    const gamerscoreReward = a.rewards?.find((r) => r.type === "Gamerscore");
    return {
        id: a.id,
        name: a.name,
        description: a.description,
        isUnlocked: a.progressState === "Achieved",
        timeUnlocked: a.progression?.timeUnlocked,
        gamerscore: gamerscoreReward ? Number(gamerscoreReward.value) : 0,
        rarityPercent: a.rarity?.currentPercentage,
    };
}

// Paginated (32/page by default on Xbox's side) - follow pagingInfo.continuationToken
// until it comes back null.
export async function getAchievementsForTitle(apiKey: string, titleId: string): Promise<XboxAchievement[]> {
    const results: XboxAchievement[] = [];
    let continuationToken: string | null = null;

    do {
        const query = continuationToken ? `?continuationToken=${continuationToken}` : "";
        const content: { achievements: RawXboxAchievement[]; pagingInfo?: { continuationToken: string | null } } =
            await get(apiKey, `/v2/achievements/title/${titleId}${query}`);
        results.push(...content.achievements.map(mapAchievement));
        continuationToken = content.pagingInfo?.continuationToken ?? null;
    } while (continuationToken);

    return results;
}

interface RawX360Achievement {
    id: number;
    name: string;
    description: string;
    unlocked: boolean;
    timeUnlocked?: string;
    gamerscore: number;
    rarity?: { currentPercentage?: number };
}

function mapX360Achievement(a: RawX360Achievement): XboxAchievement {
    return {
        id: String(a.id),
        name: a.name,
        description: a.description,
        isUnlocked: a.unlocked,
        timeUnlocked: a.timeUnlocked,
        gamerscore: a.gamerscore,
        rarityPercent: a.rarity?.currentPercentage,
    };
}

// The modern /v2/achievements/title endpoint returns an empty list (not an
// error) for classic Xbox 360 titles - they use a separate legacy contract.
// Note this endpoint only returns achievements the player has unlocked, not
// the full title catalog, so totals for these games will read as earned/earned
// rather than earned/all - a real gap in what this data source exposes for
// backward-compatible titles, not a bug.
export async function getX360AchievementsForTitle(
    apiKey: string,
    xuid: string,
    titleId: string
): Promise<XboxAchievement[]> {
    const content = await get<{ achievements: RawX360Achievement[] }>(
        apiKey,
        `/v2/achievements/x360/${xuid}/title/${titleId}`
    );
    return content.achievements.map(mapX360Achievement);
}
