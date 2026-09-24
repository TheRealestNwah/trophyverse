import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exchangeCodeForTokens, getAchievementsForGame, getOwnedGameIds, getProduct, GogApiError } from "./client";

const fetchMock = vi.fn();

function respond(body: unknown, status = 200) {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("GOG client response parsing", () => {
    it("maps the snake_case token response", async () => {
        respond({ access_token: "access", refresh_token: "refresh", expires_in: 3600, user_id: "4815162342" });
        await expect(exchangeCodeForTokens("code")).resolves.toEqual({
            accessToken: "access",
            refreshToken: "refresh",
            expiresIn: 3600,
            userId: "4815162342",
        });
    });

    it("reports a rejected (expired or reused) login code as an authentication error", async () => {
        respond({ error: "invalid_grant" }, 400);
        const err = await exchangeCodeForTokens("stale").catch((e) => e);
        expect(err).toBeInstanceOf(GogApiError);
        expect(err.status).toBe(401);
    });

    it("stringifies owned product ids", async () => {
        respond({ owned: [1207658924, 1495134320] });
        await expect(getOwnedGameIds("access")).resolves.toEqual(["1207658924", "1495134320"]);
        expect(fetchMock.mock.calls[0][1]).toEqual({ headers: { Authorization: "Bearer access" } });
    });

    it("prefers the 2x logo and adds https to protocol-relative image URLs", async () => {
        respond({ title: "The Witcher 3", images: { logo: "//images.gog.test/logo.jpg", logo2x: "//images.gog.test/logo2x.jpg" } });
        await expect(getProduct("1")).resolves.toEqual({ title: "The Witcher 3", coverImageUrl: "https://images.gog.test/logo2x.jpg" });

        respond({ title: "No Art" });
        await expect(getProduct("2")).resolves.toEqual({ title: "No Art", coverImageUrl: undefined });
    });

    it("treats a null unlock date as locked", async () => {
        respond({
            items: [
                {
                    achievement_id: "1",
                    achievement_key: "WIN",
                    name: "Winner",
                    description: "Win",
                    image_url_unlocked: "https://images.gog.test/win.png",
                    date_unlocked: "2024-03-01T12:00:00+0000",
                },
                { achievement_id: "2", achievement_key: "LOSE", name: "Loser", date_unlocked: null },
            ],
        });

        const [won, lost] = await getAchievementsForGame("access", "1", "user");
        expect(won).toEqual({
            id: "1",
            key: "WIN",
            name: "Winner",
            description: "Win",
            isUnlocked: true,
            unlockedAt: "2024-03-01T12:00:00+0000",
            iconUrl: "https://images.gog.test/win.png",
        });
        expect(lost).toMatchObject({ id: "2", isUnlocked: false, unlockedAt: undefined });
    });

    // Regression test for #146: an achievement nobody has unlocked yet only
    // ever has image_url_locked set (GOG doesn't populate image_url_unlocked
    // until it's actually been earned by someone), so falling back to
    // image_url_unlocked alone left every never-unlocked achievement with no
    // icon at all, despite GOG providing one for the locked state.
    it("falls back to the locked icon when the unlocked variant isn't populated yet", async () => {
        respond({
            items: [
                {
                    achievement_id: "3",
                    achievement_key: "NEVER_WON",
                    name: "Never Won",
                    image_url_locked: "https://images.gog.test/never-won-locked.png",
                    date_unlocked: null,
                },
            ],
        });

        const [achievement] = await getAchievementsForGame("access", "1", "user");
        expect(achievement).toMatchObject({
            id: "3",
            isUnlocked: false,
            iconUrl: "https://images.gog.test/never-won-locked.png",
        });
    });

    it("returns no achievements for a game without an achievements schema", async () => {
        respond({}, 404);
        await expect(getAchievementsForGame("access", "1", "user")).resolves.toEqual([]);
    });

    it("still surfaces a rejected access token instead of hiding it as an empty list", async () => {
        respond({}, 401);
        await expect(getAchievementsForGame("expired", "1", "user")).rejects.toMatchObject({ status: 401 });
    });
});
