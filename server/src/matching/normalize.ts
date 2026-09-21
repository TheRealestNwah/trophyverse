// Shared normalization for comparing titles/names across platforms that
// format the same real-world game or achievement slightly differently
// (trademark symbols, punctuation, casing).
export function normalize(text: string): string {
    return text
        .toLowerCase()
        .replace(/[®™©]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

export function wordOverlapScore(a: string, b: string): number {
    const wordsA = new Set(normalize(a).split(" ").filter(Boolean));
    const wordsB = new Set(normalize(b).split(" ").filter(Boolean));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let shared = 0;
    for (const word of wordsA) if (wordsB.has(word)) shared++;
    return shared / Math.max(wordsA.size, wordsB.size);
}

// Game titles across platforms often differ by a subtitle or edition suffix
// rather than by substitution - "Skyrim" vs "The Elder Scrolls V: Skyrim
// Special Edition", or "Grand Theft Auto V" vs "Grand Theft Auto V: Legacy" -
// which wordOverlapScore's max-based denominator penalizes heavily (0.2 for
// the Skyrim case, see normalize.test.ts) even though every word of the
// shorter title appears in the longer one.
//
// A plain word-SET containment score (shared words / shorter title's word
// count) looks like the fix, but isn't: it can't tell "same title with a
// suffix appended" from "same franchise prefix, different sequel" - both are
// "N-1 of N words shared." "Assassin's Creed II" vs "Assassin's Creed
// Odyssey" scores 0.75 under set containment despite being different games,
// purely from the 3-word shared prefix. A shared word FROM ANYWHERE in
// either title (a stray "2", "3", or "the") is enough to produce a
// deceptively high score between otherwise-unrelated titles.
//
// This checks something stricter: does the *entire, in-order* word sequence
// of the shorter title appear as a contiguous run inside the longer one? That
// correctly accepts "grand theft auto v" as a prefix of "grand theft auto v
// legacy", and "skyrim" as a mid-sequence run inside "the elder scrolls v
// skyrim special edition" - but rejects "assassin s creed ii" against
// "assassin s creed odyssey" (the sequences diverge at the 4th word) and
// "fallout 3" against "arma 3" (no shared prefix at all, despite both ending
// in "3").
//
// One more case a pure subsequence check doesn't catch on its own: "BioShock"
// is a subsequence of "BioShock 2" (a strict prefix, in fact), but those are
// different games in a series, not the same game under two names - a sequel,
// not a re-release. The tell is *what* the longer title adds beyond the
// shorter one: a real word ("Legacy", "Remastered", "Special Edition")
// usually means an edition/re-release of the same game, while a bare number
// with nothing else added usually means a sequel. So a match is rejected
// when every word the longer title has beyond the shared run is purely
// numeric.
//
// Used by gameMatcher for review-candidate detection (#76), not for
// automatic merging.
// These words are valid game titles, but are too common to identify a game
// when they occur as the only shared word in a longer title (e.g. PAIN in
// METAL GEAR SOLID V: THE PHANTOM PAIN). Keep this list deliberately small and
// review-oriented: it filters noisy human-review candidates without changing
// the exact-title auto-merge path.
const NON_DISTINCTIVE_SINGLE_WORD_TITLES = new Set([
    "action",
    "adventure",
    "battle",
    "city",
    "dark",
    "dead",
    "death",
    "dream",
    "fight",
    "fire",
    "forest",
    "hero",
    "home",
    "life",
    "man",
    "night",
    "pain",
    "shadow",
    "thief",
    "war",
    "world",
]);

export function isTitleSubsequenceMatch(a: string, b: string): boolean {
    const wordsA = normalize(a).split(" ").filter(Boolean);
    const wordsB = normalize(b).split(" ").filter(Boolean);
    if (wordsA.length === 0 || wordsB.length === 0) return false;

    const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];

    // A single short/common word ("the", "2", "pain") trivially "appears
    // inside" almost every other title - only trust a one-word shorter title
    // when that word is distinctive enough to mean something on its own.
    if (
        shorter.length === 1 &&
        (shorter[0].length < 4 || NON_DISTINCTIVE_SINGLE_WORD_TITLES.has(shorter[0]))
    ) {
        return false;
    }

    for (let start = 0; start <= longer.length - shorter.length; start++) {
        if (!shorter.every((word, i) => longer[start + i] === word)) continue;

        const extra = [...longer.slice(0, start), ...longer.slice(start + shorter.length)];
        if (extra.length > 0 && extra.every((word) => /^\d+$/.test(word))) continue; // bare sequel number, not an edition suffix

        return true;
    }
    return false;
}
