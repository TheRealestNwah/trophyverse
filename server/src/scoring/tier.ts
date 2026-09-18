// No PSN match exists yet for a freshly-synced achievement on another
// platform (that's a later matching job's job), so tier is inferred from
// global unlock rarity. See docs/data-model.md for why this is a distinct,
// revisitable tier_source. Shared across every non-PSN platform client so
// the bucketing is identical regardless of source.
export function resolveTierFromRarity(percent: number | undefined): { tier: string; points: number } {
    const p = percent ?? 100; // unknown rarity: treat as common rather than over-crediting it
    if (p < 5) return { tier: "platinum", points: 300 };
    if (p < 15) return { tier: "gold", points: 90 };
    if (p < 50) return { tier: "silver", points: 30 };
    return { tier: "bronze", points: 15 };
}
