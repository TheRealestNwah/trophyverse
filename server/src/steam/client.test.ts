import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// config.ts requires the full server env at import time; only the key matters here.
vi.mock("../config", () => ({ config: { steamApiKey: "test-steam-key" } }));

import { getGlobalAchievementPercentages, getOwnedGames, getPlayerAchievements, getSchemaForGame, searchApps } from "./client";

const fetchMock = vi.fn();

function respond(body: unknown, status = 200) {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

function requestedUrl(call = 0): URL {
    return fetchMock.mock.calls[call][0] as URL;
}

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("Steam client response parsing", () => {
    it("authenticates every Web API call with the configured key and asks for JSON", async () => {
        respond({ response: { games: [] } });
        await getOwnedGames("76561190000000000");

        const url = requestedUrl();
        expect(url.searchParams.get("key")).toBe("test-steam-key");
        expect(url.searchParams.get("format")).toBe("json");
        expect(url.searchParams.get("steamid")).toBe("76561190000000000");
        expect(url.searchParams.get("include_played_free_games")).toBe("1");
    });

    it("treats an owned-games response with no games list (private profile) as an empty library", async () => {
        respond({ response: {} });
        await expect(getOwnedGames("1")).resolves.toEqual([]);
    });

    it("maps the achievement schema's icon field to iconUrl", async () => {
        respond({
            game: {
                availableGameStats: {
                    achievements: [
                        { name: "ACH_WIN", displayName: "Winner", description: "Win once", icon: "https://cdn.test/win.jpg" },
                        { name: "ACH_HIDDEN", displayName: "Secret" },
                    ],
                },
            },
        });

        await expect(getSchemaForGame(10)).resolves.toEqual([
            { name: "ACH_WIN", displayName: "Winner", description: "Win once", iconUrl: "https://cdn.test/win.jpg" },
            { name: "ACH_HIDDEN", displayName: "Secret", description: undefined, iconUrl: undefined },
        ]);
    });

    it("returns no schema for a game without stats rather than throwing", async () => {
        respond({ game: {} });
        await expect(getSchemaForGame(10)).resolves.toEqual([]);
    });

    it("returns no player achievements when Steam rejects the request (no stats, private profile)", async () => {
        respond({ playerstats: { error: "Requested app has no stats", success: false } }, 400);
        await expect(getPlayerAchievements(10, "1")).resolves.toEqual([]);
    });

    it("passes player achievement rows through unchanged", async () => {
        const achievements = [
            { apiname: "ACH_WIN", achieved: 1, unlocktime: 1700000000 },
            { apiname: "ACH_LOSE", achieved: 0, unlocktime: 0 },
        ];
        respond({ playerstats: { achievements, success: true } });
        await expect(getPlayerAchievements(10, "1")).resolves.toEqual(achievements);
    });

    it("keys global rarity by achievement api name", async () => {
        respond({ achievementpercentages: { achievements: [{ name: "ACH_WIN", percent: 12.5 }, { name: "ACH_LOSE", percent: 80 }] } });

        const rarity = await getGlobalAchievementPercentages(10);
        expect(rarity.get("ACH_WIN")).toBe(12.5);
        expect(rarity.get("ACH_LOSE")).toBe(80);
        expect(requestedUrl().searchParams.get("gameid")).toBe("10");
    });

    it("returns an empty rarity map when the global percentages call fails", async () => {
        respond({}, 403);
        await expect(getGlobalAchievementPercentages(10)).resolves.toEqual(new Map());
    });

    it("searches the keyless store endpoint and tolerates failures", async () => {
        respond({ items: [{ id: 489830, name: "The Elder Scrolls V: Skyrim Special Edition", type: "app" }] });
        await expect(searchApps("skyrim")).resolves.toEqual([{ id: 489830, name: "The Elder Scrolls V: Skyrim Special Edition", type: "app" }]);
        expect(requestedUrl().hostname).toBe("store.steampowered.com");
        expect(requestedUrl().searchParams.has("key")).toBe(false);

        respond({}, 500);
        await expect(searchApps("skyrim")).resolves.toEqual([]);
    });
});
