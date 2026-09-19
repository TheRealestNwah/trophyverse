import { describe, expect, it } from "vitest";
import { normalize, wordOverlapScore } from "./normalize";

describe("normalize", () => {
    it("lowercases and strips trademark symbols", () => {
        expect(normalize("Bioshock®")).toBe("bioshock");
        expect(normalize("Fortnite™")).toBe("fortnite");
    });

    it("collapses punctuation into single spaces", () => {
        expect(normalize("Marvel's Spider-Man: Miles Morales")).toBe("marvel s spider man miles morales");
    });

    it("collapses repeated whitespace and trims", () => {
        expect(normalize("  The   Witcher  3  ")).toBe("the witcher 3");
    });

    it("makes cross-platform title variants compare equal", () => {
        expect(normalize("Half-Life 2")).toBe(normalize("HALF-LIFE 2"));
    });
});

describe("wordOverlapScore", () => {
    it("scores an exact match as 1", () => {
        expect(wordOverlapScore("Half-Life 2", "Half-Life 2")).toBe(1);
    });

    it("scores completely disjoint titles as 0", () => {
        expect(wordOverlapScore("Half-Life 2", "Portal")).toBe(0);
    });

    it("scores 0 when either input has no words after normalization", () => {
        expect(wordOverlapScore("", "Half-Life 2")).toBe(0);
        expect(wordOverlapScore("Half-Life 2", "")).toBe(0);
        expect(wordOverlapScore("---", "Half-Life 2")).toBe(0);
    });

    it("divides shared words by the larger word set (asymmetric title lengths)", () => {
        // "the elder scrolls v skyrim" (5 words) vs "skyrim" (1 word):
        // 1 shared word / max(5, 1) = 0.2
        expect(wordOverlapScore("The Elder Scrolls V: Skyrim", "Skyrim")).toBeCloseTo(0.2);
    });

    it("is symmetric regardless of argument order", () => {
        const a = "The Elder Scrolls V: Skyrim";
        const b = "Skyrim";
        expect(wordOverlapScore(a, b)).toBe(wordOverlapScore(b, a));
    });
});
