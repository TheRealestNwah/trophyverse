import { XboxLiveSession } from "./oauth";

const TITLE_HUB_URL = "https://titlehub.xboxlive.com";
const ACHIEVEMENTS_URL = "https://achievements.xboxlive.com";

async function get<T>(url: string, session: XboxLiveSession, contractVersion: string): Promise<T> {
    const res = await fetch(url, {
        headers: {
            Authorization: session.authHeader,
            "x-xbl-contract-version": contractVersion,
            Accept: "application/json",
        },
    });
    if (!res.ok) {
        throw new Error(`Xbox Live API ${url} failed: ${res.status} ${await res.text()}`);
    }
    return res.json() as Promise<T>;
}

export interface XboxTitle {
    titleId: string;
    name: string;
    totalAchievements: number;
    currentAchievements: number;
}

export async function getTitleHistory(xuid: string, session: XboxLiveSession): Promise<XboxTitle[]> {
    const data = await get<{
        titles: Array<{
            titleId: number;
            name: string;
            achievement?: { totalAchievements: number; currentAchievements: number };
        }>;
    }>(
        `${TITLE_HUB_URL}/users/xuid(${xuid})/titles/titlehistory/decoration/achievement`,
        session,
        "2"
    );

    return data.titles
        .filter((t) => (t.achievement?.totalAchievements ?? 0) > 0)
        .map((t) => ({
            titleId: String(t.titleId),
            name: t.name,
            totalAchievements: t.achievement!.totalAchievements,
            currentAchievements: t.achievement!.currentAchievements,
        }));
}

export interface XboxAchievement {
    id: string;
    name: string;
    description?: string;
    unlocked: boolean;
    unlockedAt?: string;
    globalUnlockRarity?: number;
}

export async function getAchievementsForTitle(
    xuid: string,
    titleId: string,
    session: XboxLiveSession
): Promise<XboxAchievement[]> {
    try {
        const data = await get<{
            achievements: Array<{
                id: string;
                name: string;
                description?: string;
                progressState: string;
                progression?: { timeUnlocked?: string };
                rarity?: { currentPercentage?: number };
            }>;
        }>(`${ACHIEVEMENTS_URL}/users/xuid(${xuid})/achievements?titleId=${titleId}`, session, "2");

        return data.achievements.map((a) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            unlocked: a.progressState === "Achieved",
            unlockedAt: a.progression?.timeUnlocked,
            globalUnlockRarity: a.rarity?.currentPercentage,
        }));
    } catch {
        return [];
    }
}
