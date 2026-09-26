import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { titleMatchesSearch } = require("../public/search-text.js");

describe("game title search", () => {
    it("ignores trademark symbols and apostrophe styles (#171)", () => {
        expect(titleMatchesSearch("Assassin’s Creed® Chronicles: China", "assassin's creed")).toBe(true);
        expect(titleMatchesSearch("Assassin’s Creed® Chronicles: China", "assassins creed chronicles china")).toBe(true);
        expect(titleMatchesSearch("Tom Clancy's Rainbow Six® Siege", "rainbow six siege")).toBe(true);
    });

    it("ignores accents, case and punctuation", () => {
        expect(titleMatchesSearch("Pokémon™ Legends: Arceus", "pokemon legends arceus")).toBe(true);
        expect(titleMatchesSearch("METAL GEAR SOLID V: THE PHANTOM PAIN", "metal gear solid v - the phantom")).toBe(true);
    });

    it("keeps non-Latin titles searchable", () => {
        expect(titleMatchesSearch("ペルソナ5 ザ・ロイヤル", "ペルソナ5")).toBe(true);
    });

    it("still rejects titles that don't contain the search", () => {
        expect(titleMatchesSearch("Assassin's Creed II", "assassin's creed odyssey")).toBe(false);
    });

    it("matches everything for an empty or punctuation-only search", () => {
        expect(titleMatchesSearch("Halo 4", "")).toBe(true);
        expect(titleMatchesSearch("Halo 4", " ® ")).toBe(true);
    });
});

describe("acronym search (#194)", () => {
    it("expands a known built-in acronym to match its franchise", () => {
        expect(titleMatchesSearch("Grand Theft Auto V", "GTA")).toBe(true);
        expect(titleMatchesSearch("Metal Gear Solid V: The Phantom Pain", "mgs")).toBe(true);
        expect(titleMatchesSearch("Assassin's Creed Valhalla", "AC")).toBe(true);
    });

    it("only expands an acronym that leads the query", () => {
        expect(titleMatchesSearch("Grand Theft Auto V", "the gta")).toBe(false);
    });

    it("still matches a plain literal substring, acronym or not", () => {
        expect(titleMatchesSearch("Metal Gear Solid V", "solid")).toBe(true);
    });

    it("accepts a custom acronym map, overriding/extending the built-in set", () => {
        expect(titleMatchesSearch("Baldur's Gate 3", "bg3", { bg3: "baldur's gate" })).toBe(true);
        expect(titleMatchesSearch("Grand Theft Auto V", "gta", {})).toBe(false);
    });
});

describe("acronym plus sequel number or subtitle (#216)", () => {
    it("matches an acronym glued to or spaced from a number", () => {
        expect(titleMatchesSearch("Resident Evil 5", "re5")).toBe(true);
        expect(titleMatchesSearch("Resident Evil 5", "RE 5")).toBe(true);
        expect(titleMatchesSearch("Resident Evil 4", "re5")).toBe(false);
    });

    it("treats the number as a whole word", () => {
        expect(titleMatchesSearch("Resident Evil 50", "re5")).toBe(false);
        expect(titleMatchesSearch("Grand Theft Auto: Vice City", "gta5")).toBe(false);
    });

    it("maps a number to its roman numeral", () => {
        expect(titleMatchesSearch("Grand Theft Auto V", "gta5")).toBe(true);
        expect(titleMatchesSearch("Metal Gear Solid V: The Phantom Pain", "mgs 5")).toBe(true);
        expect(titleMatchesSearch("Final Fantasy XIV Online", "ff14")).toBe(true);
    });

    it("expands an acronym followed by more words", () => {
        expect(titleMatchesSearch("Assassin's Creed Unity", "ac unity")).toBe(true);
        expect(titleMatchesSearch("Assassin's Creed Unity", "ac odyssey")).toBe(false);
    });

    it("still prefers a custom acronym containing digits", () => {
        expect(titleMatchesSearch("Baldur's Gate 3", "bg3", { bg3: "baldur's gate 3" })).toBe(true);
    });
});
