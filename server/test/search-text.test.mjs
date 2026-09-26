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

    it("doesn't expand a partial/longer query, only the whole normalized query", () => {
        expect(titleMatchesSearch("Grand Theft Auto V", "gta 5")).toBe(false);
    });

    it("still matches a plain literal substring, acronym or not", () => {
        expect(titleMatchesSearch("Metal Gear Solid V", "solid")).toBe(true);
    });

    it("accepts a custom acronym map, overriding/extending the built-in set", () => {
        expect(titleMatchesSearch("Baldur's Gate 3", "bg3", { bg3: "baldur's gate" })).toBe(true);
        expect(titleMatchesSearch("Grand Theft Auto V", "gta", {})).toBe(false);
    });
});
