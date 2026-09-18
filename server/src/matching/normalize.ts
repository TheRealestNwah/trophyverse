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
