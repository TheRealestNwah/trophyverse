import { describe, expect, it } from "vitest";
import { normalize, wordOverlapScore, isTitleSubsequenceMatch } from "./normalize";

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

describe("isTitleSubsequenceMatch", () => {
    it("matches a short title appearing mid-sequence in a longer one", () => {
        expect(isTitleSubsequenceMatch("The Elder Scrolls V: Skyrim Special Edition", "Skyrim")).toBe(true);
    });

    it("matches a title that's an exact prefix of a longer one", () => {
        expect(isTitleSubsequenceMatch("Grand Theft Auto V", "Grand Theft Auto V: Legacy")).toBe(true);
    });

    it("is symmetric regardless of argument order", () => {
        const a = "The Elder Scrolls V: Skyrim Special Edition";
        const b = "Skyrim";
        expect(isTitleSubsequenceMatch(a, b)).toBe(isTitleSubsequenceMatch(b, a));
    });

    it("matches an exact match", () => {
        expect(isTitleSubsequenceMatch("Half-Life 2", "Half-Life 2")).toBe(true);
    });

    it("rejects completely disjoint titles", () => {
        expect(isTitleSubsequenceMatch("Half-Life 2", "Portal")).toBe(false);
    });

    it("rejects a shared franchise prefix with a diverging sequel/subtitle", () => {
        // "assassin s creed ii" vs "assassin s creed odyssey" - shares its
        // first 3 words with the other title, but the sequences diverge at
        // the 4th, so it's not a contiguous run inside the longer title.
        expect(isTitleSubsequenceMatch("Assassin's Creed II", "Assassin's Creed Odyssey")).toBe(false);
    });

    it("rejects titles that only share a trailing number", () => {
        expect(isTitleSubsequenceMatch("Fallout 3", "Arma 3")).toBe(false);
    });

    it("rejects a single short/common word as the shorter title", () => {
        expect(isTitleSubsequenceMatch("The Forest", "The Elder Scrolls Online")).toBe(false);
    });

    it("still matches a single word when it's distinctive enough", () => {
        expect(isTitleSubsequenceMatch("Doom", "Doom Eternal")).toBe(true);
    });

    it("rejects a common trailing word from an unrelated longer title", () => {
        expect(isTitleSubsequenceMatch("METAL GEAR SOLID V: THE PHANTOM PAIN", "PAIN")).toBe(false);
        expect(isTitleSubsequenceMatch("Uncharted 4: A Thief's End™", "Thief")).toBe(false);
    });

    it("rejects a sequel that only adds a bare number", () => {
        // "BioShock" is a strict prefix of "BioShock 2", but that's a
        // sequel, not a re-release of the same game.
        expect(isTitleSubsequenceMatch("BioShock", "BioShock 2")).toBe(false);
        expect(isTitleSubsequenceMatch("Silent Hill", "Silent Hill 2")).toBe(false);
    });

    it("still matches when the added words aren't purely numeric", () => {
        expect(isTitleSubsequenceMatch("BioShock", "BioShock Remastered")).toBe(true);
    });

    it("is false when either input has no words after normalization", () => {
        expect(isTitleSubsequenceMatch("", "Half-Life 2")).toBe(false);
        expect(isTitleSubsequenceMatch("---", "Half-Life 2")).toBe(false);
    });
});
