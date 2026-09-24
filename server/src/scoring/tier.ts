// Mirrors the tier_points table in db/schema.sql (PSN's published values).
export const TIER_POINTS: Record<string, number> = {
    bronze: 15,
    silver: 30,
    gold: 90,
    platinum: 300,
};

// Fixed global rarity cutoffs, used both by resolveTierFromRarity below and
// as the percentile split in planPercentileTiers - see issue #10.
export const GOLD_RARITY_THRESHOLD = 15;
export const SILVER_RARITY_THRESHOLD = 50;

// Shared by every platform's sync job. When no PSN release exists for an
// achievement (see docs/data-model.md), its tier is inferred from global
// unlock rarity - the only signal every platform can provide.
//
// Deliberately caps out at gold, never platinum: on real PSN, Platinum isn't
// "the rarest tier" - it's specifically the single per-game completion
// trophy awarded for collecting everything else. A game can easily have
// several achievements under 5% global unlock on Steam/Xbox, and bucketing
// "very rare" as platinum meant games showing multiple "platinums" that
// were really just hard achievements - not actual full completions. Platinum
// should only ever come from a real PSN trophy (tier_source = 'psn_native'),
// or inherited from one via matching.
//
// This is a per-achievement guess using fixed global thresholds - it's what
// every achievement gets at insert/merge time, before a game's full
// achievement list (and thus its rarity distribution) is known. See
// planPercentileTiers for the per-game correction applied afterward for
// games where these fixed cutoffs don't fit (docs/data-model.md, issue #10).
export function resolveTierFromRarity(percent: number | undefined): { tier: string; points: number } {
    const p = percent ?? 100; // unknown rarity: treat as common rather than over-crediting it
    if (p < GOLD_RARITY_THRESHOLD) return { tier: "gold", points: TIER_POINTS.gold };
    if (p < SILVER_RARITY_THRESHOLD) return { tier: "silver", points: TIER_POINTS.silver };
    return { tier: "bronze", points: TIER_POINTS.bronze };
}

// Alternative to resolveTierFromRarity for games whose achievement-rarity
// distribution is skewed heavily toward "rare" (e.g. Payday 2's median
// global unlock rate is 5.7%, so the fixed 15% gold cutoff above swallows
// ~93% of its list into gold). Ranks a game's own rarity_fallback
// achievements against each other and buckets by rank using the same
// 15/50 percentile split, so tier *proportions* stay roughly comparable
// across games even though rarity magnitudes no longer are. Only meant to
// be used when normalizeRarityTiersForGame (rarityNormalization.ts) detects
// that skew - normal games keep resolveTierFromRarity's fixed thresholds.
// A synthetic, never-persisted platinum awarded for 100%-completing a game
// that doesn't already have a real one - see #145. Steam/Xbox/GOG/
// RetroAchievements games (and any psn_native game that just hasn't earned
// its own Platinum trophy row yet) previously could never show a platinum
// at all, even at 100%, because of the psn_native restriction documented
// above resolveTierFromRarity.
//
// This is deliberately NOT another tier_source value alongside 'psn_native'/
// 'rarity_fallback': those describe where an individual
// canonical_achievements row's tier came from, and a completion platinum
// isn't a row - there's no achievement it's "the tier of". It's a derived
// fact about the whole game ("every achievement in it is unlocked"),
// recomputed fresh from the same unlocked/total counts the games list and
// stats already compute (games/queries.ts). That means it can never drift
// out of sync with the underlying unlocks, needs no migration/backfill to
// backfill existing 100%-complete libraries, and naturally disappears again
// if an unlock is ever revoked. COMPLETION_PLATINUM_SOURCE exists purely so
// API responses can tag it as synthetic for callers that care (e.g. to
// avoid implying PSN sourced it), not as a tier_source.
export const COMPLETION_PLATINUM_SOURCE = "completion_synthetic";

export interface GameCompletionCounts {
    totalAchievements: number;
    unlockedAchievements: number;
    // Real (psn_native, or matched-in from one) platinum unlocks already
    // counted for this game the normal way - see games/queries.ts.
    platinumUnlocked: number;
}

// A game qualifies for the synthetic completion platinum once every one of
// its achievements is unlocked, as long as it doesn't already have a real
// platinum. Checking platinumUnlocked === 0 (not tier_source) is deliberate:
// a psn_native game's real platinum is just another canonical_achievements
// row, so once it's unlocked this already returns false without needing to
// know anything about where any tier came from.
export function qualifiesForCompletionPlatinum(counts: GameCompletionCounts): boolean {
    return (
        counts.totalAchievements > 0 &&
        counts.unlockedAchievements >= counts.totalAchievements &&
        counts.platinumUnlocked === 0
    );
}

export function planPercentileTiers(rarities: (number | undefined)[]): { tier: string; points: number }[] {
    const withIndex = rarities.map((rarity, index) => ({ index, rarity: rarity ?? 100 }));
    const sorted = [...withIndex].sort((a, b) => a.rarity - b.rarity);
    const n = sorted.length;
    const result: { tier: string; points: number }[] = new Array(n);

    sorted.forEach((entry, rank) => {
        const percentile = ((rank + 1) / n) * 100;
        const tier =
            percentile <= GOLD_RARITY_THRESHOLD ? "gold" : percentile <= SILVER_RARITY_THRESHOLD ? "silver" : "bronze";
        result[entry.index] = { tier, points: TIER_POINTS[tier] };
    });

    return result;
}
