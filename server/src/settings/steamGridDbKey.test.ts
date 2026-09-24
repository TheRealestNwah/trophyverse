import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ pool: { query: vi.fn() } }));

import { isValidSteamGridDbApiKey } from "./steamGridDbKey";

const fetchMock = vi.fn();

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("SteamGridDB key validation", () => {
    it("probes the API with the key as a bearer token", async () => {
        fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));

        await expect(isValidSteamGridDbApiKey("abc123")).resolves.toBe(true);
        expect(fetchMock.mock.calls[0][0]).toBe("https://www.steamgriddb.com/api/v2/games/steam/220");
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer abc123");
    });

    it("rejects a key SteamGridDB doesn't recognise", async () => {
        fetchMock.mockResolvedValueOnce(new Response("{}", { status: 401 }));
        await expect(isValidSteamGridDbApiKey("wrong")).resolves.toBe(false);
    });

    it("reports an outage as an error rather than a bad key", async () => {
        fetchMock.mockResolvedValueOnce(new Response("{}", { status: 503 }));
        await expect(isValidSteamGridDbApiKey("abc123")).rejects.toThrow("503");
    });
});
