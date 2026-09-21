import { describe, expect, it } from "vitest";
import { hasPlatformCollision } from "./platformCollision";

describe("hasPlatformCollision", () => {
    it("detects a platform represented by multiple canonical games", () => {
        expect(hasPlatformCollision([["steam", "psn"], ["xbox", "psn"]])).toBe(true);
    });

    it("allows a group whose games are on distinct platforms", () => {
        expect(hasPlatformCollision([["steam"], ["xbox"]])).toBe(false);
    });

    it("handles an empty exact-title group", () => {
        expect(hasPlatformCollision([])).toBe(false);
    });
});
