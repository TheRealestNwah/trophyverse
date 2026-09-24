import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getConsoleIds, getGameCatalogEntry, getGameProgress, getUserGames, RetroApiError, verifyAccount } from "./client";

const fetchMock = vi.fn();

function respond(body: unknown, status = 200) {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    fetchMock.mockResolvedValueOnce(new Response(text, { status }));
}

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("RetroAchievements client response parsing", () => {
    it("reads the account name from the User field, not Username", async () => {
        respond({ User: "RetroFan", TotalPoints: 4321 });
        await expect(verifyAccount("retrofan", "key")).resolves.toEqual({ username: "RetroFan", totalPoints: 4321 });
    });

    it("treats a 200 summary with no User field as an unknown account", async () => {
        respond({ Username: "RetroFan" });
        await expect(verifyAccount("retrofan", "key")).rejects.toMatchObject({ status: 404 });
    });

    it("treats an empty 200 body as rejected credentials", async () => {
        respond("");
        const err = await verifyAccount("retrofan", "bad-key").catch((e) => e);
        expect(err).toBeInstanceOf(RetroApiError);
        expect(err.status).toBe(401);
    });

    it("reports a non-JSON body as an upstream error", async () => {
        respond("<html>maintenance</html>");
        await expect(verifyAccount("retrofan", "key")).rejects.toMatchObject({ status: 502 });
    });

    it("maps 401 and 403 responses to a credentials error", async () => {
        respond({}, 403);
        await expect(verifyAccount("retrofan", "key")).rejects.toMatchObject({ status: 403 });
    });

    it("collapses separate softcore and hardcore rows into one game with a media URL", async () => {
        respond([
            { GameID: 1, Title: "Sonic the Hedgehog", ImageIcon: "/Images/000001.png", HardcoreMode: "0" },
            { GameID: 1, Title: "Sonic the Hedgehog", ImageIcon: "/Images/000001.png", HardcoreMode: "1" },
            { GameID: 2, Title: "Super Mario Bros." },
        ]);

        await expect(getUserGames("retrofan", "key")).resolves.toEqual([
            { gameId: "1", title: "Sonic the Hedgehog", coverImageUrl: "https://media.retroachievements.org/Images/000001.png" },
            { gameId: "2", title: "Super Mario Bros.", coverImageUrl: undefined },
        ]);
    });

    it("counts softcore or hardcore unlocks, prefers the hardcore date, and derives rarity from casual players", async () => {
        respond({
            NumDistinctPlayersCasual: "200",
            Achievements: {
                "10": { ID: 10, Title: "Softcore", Description: "a", NumAwarded: 50, DateEarned: "2024-01-01 10:00:00", BadgeName: "12345" },
                "11": {
                    ID: 11,
                    Title: "Hardcore",
                    Description: "b",
                    NumAwarded: 20,
                    DateEarned: "2024-01-01 10:00:00",
                    DateEarnedHardcore: "2024-02-02 12:00:00",
                },
                "12": { ID: 12, Title: "Locked", Description: "c", NumAwarded: 2 },
            },
        });

        const [softcore, hardcore, locked] = await getGameProgress("retrofan", "key", "1");
        expect(softcore).toMatchObject({ id: "10", isUnlocked: true, unlockedAt: "2024-01-01 10:00:00", globalUnlockRarity: 25 });
        expect(softcore.iconUrl).toBe("https://media.retroachievements.org/Badge/12345.png");
        expect(hardcore).toMatchObject({ id: "11", isUnlocked: true, unlockedAt: "2024-02-02 12:00:00", globalUnlockRarity: 10 });
        expect(locked).toMatchObject({ id: "12", isUnlocked: false, unlockedAt: undefined, globalUnlockRarity: 1 });
    });

    it("leaves rarity unknown when the game reports no players", async () => {
        respond({ NumDistinctPlayersCasual: 0, Achievements: { "1": { ID: 1, Title: "t", Description: "d", NumAwarded: 0 } } });
        const [achievement] = await getGameProgress("retrofan", "key", "1");
        expect(achievement.globalUnlockRarity).toBeUndefined();
    });

    it("returns no achievements for a game with no achievement set", async () => {
        respond({ NumDistinctPlayersCasual: 10 });
        await expect(getGameProgress("retrofan", "key", "1")).resolves.toEqual([]);
    });

    it("reads catalog entries as locked achievements with rarity", async () => {
        respond({ NumDistinctPlayersCasual: 100, Achievements: { "5": { ID: 5, Title: "t", Description: "d", NumAwarded: 40 } } });
        await expect(getGameCatalogEntry("key", "1")).resolves.toEqual([
            { id: "5", name: "t", description: "d", isUnlocked: false, globalUnlockRarity: 40, iconUrl: undefined },
        ]);
    });

    it("excludes non-game console groupings like Hubs and Events", async () => {
        respond([
            { ID: 1, Name: "Genesis/Mega Drive", IsGameSystem: true },
            { ID: 100, Name: "Hubs", IsGameSystem: false },
            { ID: 7, Name: "NES/Famicom" },
        ]);
        await expect(getConsoleIds("key")).resolves.toEqual([
            { id: 1, name: "Genesis/Mega Drive" },
            { id: 7, name: "NES/Famicom" },
        ]);
    });
});
