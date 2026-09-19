import { describe, expect, it } from "vitest";
import { resolveTierFromRarity, planPercentileTiers, TIER_POINTS, GOLD_RARITY_THRESHOLD, SILVER_RARITY_THRESHOLD } from "./tier";

describe("resolveTierFromRarity", () => {
    it("buckets below the gold threshold as gold", () => {
        expect(resolveTierFromRarity(GOLD_RARITY_THRESHOLD - 1)).toEqual({ tier: "gold", points: TIER_POINTS.gold });
    });

    it("buckets between the gold and silver thresholds as silver", () => {
        expect(resolveTierFromRarity(SILVER_RARITY_THRESHOLD - 1)).toEqual({ tier: "silver", points: TIER_POINTS.silver });
    });

    it("buckets at or above the silver threshold as bronze", () => {
        expect(resolveTierFromRarity(SILVER_RARITY_THRESHOLD)).toEqual({ tier: "bronze", points: TIER_POINTS.bronze });
        expect(resolveTierFromRarity(100)).toEqual({ tier: "bronze", points: TIER_POINTS.bronze });
    });

    it("treats unknown rarity as common (bronze) rather than over-crediting it", () => {
        expect(resolveTierFromRarity(undefined)).toEqual({ tier: "bronze", points: TIER_POINTS.bronze });
    });

    it("never returns platinum - that tier is reserved for real PSN native trophies", () => {
        for (const percent of [0, 1, 5, 14.9, 30, 49.9, 50, 75, 100]) {
            expect(resolveTierFromRarity(percent).tier).not.toBe("platinum");
        }
    });
});

describe("planPercentileTiers", () => {
    it("splits a sorted list into gold/silver/bronze by the same 15/50 percentile cutoffs", () => {
        const rarities = Array.from({ length: 20 }, (_, i) => i + 1); // 1..20, evenly spread
        const result = planPercentileTiers(rarities);

        expect(result).toHaveLength(20);
        expect(result.every((r) => r.tier !== "platinum")).toBe(true);
        // Rarest-ranked (lowest rarity number = rarest) entries land in gold.
        expect(result[0].tier).toBe("gold");
        // Most common entry lands in bronze.
        expect(result[19].tier).toBe("bronze");
    });

    it("preserves input order in the output", () => {
        // 10 values so the 10th/50th percentile cutoffs land on whole ranks;
        // expected tiers below verified by running the same ranking logic
        // standalone rather than hand-computed.
        const rarities = [90, 5, 40, 60, 70, 80, 20, 30, 50, 10];
        const result = planPercentileTiers(rarities);
        expect(result.map((r) => r.tier)).toEqual([
            "bronze", "gold", "silver", "bronze", "bronze", "bronze", "silver", "silver", "bronze", "silver",
        ]);
    });

    it("treats undefined rarity as common (100) same as resolveTierFromRarity", () => {
        const result = planPercentileTiers([undefined, 1]);
        // With only 2 entries, rank 1 of 2 is the 50th percentile (silver),
        // not the 15th (gold) - percentile granularity depends on list size.
        expect(result[0].tier).toBe("bronze"); // undefined -> 100 -> rank 2/2 -> 100th percentile
        expect(result[1].tier).toBe("silver"); // rank 1/2 -> 50th percentile
    });

    it("handles a single-element list without dividing by zero", () => {
        // rank 1 of 1 -> 100th percentile -> falls past both cutoffs into bronze.
        const result = planPercentileTiers([50]);
        expect(result).toEqual([{ tier: "bronze", points: TIER_POINTS.bronze }]);
    });
});
