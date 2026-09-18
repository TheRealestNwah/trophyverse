// Mirrors the tier_points table in db/schema.sql (PSN's published values).
export const TIER_POINTS: Record<string, number> = {
    bronze: 15,
    silver: 30,
    gold: 90,
    platinum: 300,
};

// Shared by every platform's sync job. When no PSN release exists for an
// achievement (see docs/data-model.md), its tier is inferred from global
// unlock rarity - the only signal every platform can provide.
export function resolveTierFromRarity(percent: number | undefined): { tier: string; points: number } {
    const p = percent ?? 100; // unknown rarity: treat as common rather than over-crediting it
    if (p < 5) return { tier: "platinum", points: 300 };
    if (p < 15) return { tier: "gold", points: 90 };
    if (p < 50) return { tier: "silver", points: 30 };
    return { tier: "bronze", points: 15 };
}
