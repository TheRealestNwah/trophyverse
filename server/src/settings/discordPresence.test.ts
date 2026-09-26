import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("../db", () => ({ pool: { query: (...args: unknown[]) => queryMock(...args) } }));

beforeEach(() => {
    queryMock.mockReset();
});

describe("getDiscordPresenceEnabled", () => {
    it("defaults to on when no row has ever been saved (see #195)", async () => {
        const { getDiscordPresenceEnabled } = await import("./discordPresence");
        queryMock.mockResolvedValueOnce({ rows: [] });
        await expect(getDiscordPresenceEnabled()).resolves.toBe(true);
    });

    it("reflects a saved 'false' row", async () => {
        const { getDiscordPresenceEnabled } = await import("./discordPresence");
        queryMock.mockResolvedValueOnce({ rows: [{ value: "false" }] });
        await expect(getDiscordPresenceEnabled()).resolves.toBe(false);
    });

    it("reflects a saved 'true' row", async () => {
        const { getDiscordPresenceEnabled } = await import("./discordPresence");
        queryMock.mockResolvedValueOnce({ rows: [{ value: "true" }] });
        await expect(getDiscordPresenceEnabled()).resolves.toBe(true);
    });
});

describe("setDiscordPresenceEnabled", () => {
    it("upserts the setting as a string", async () => {
        const { setDiscordPresenceEnabled } = await import("./discordPresence");
        queryMock.mockResolvedValueOnce({ rows: [] });
        await setDiscordPresenceEnabled(false);
        expect(queryMock.mock.calls[0][1]).toEqual(["discord_rich_presence_enabled", "false"]);
    });
});
