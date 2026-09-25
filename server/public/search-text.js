(function (root, factory) {
    const searchText = factory();
    if (typeof module === "object" && module.exports) module.exports = searchText;
    if (root) root.SearchText = searchText;
})(typeof window !== "undefined" ? window : undefined, function () {
    // Platforms format the same title differently (see #171): trademark
    // symbols glued to a word ("Creed®"), curly vs straight apostrophes,
    // accents, colons and dashes. Both the title and what the user typed go
    // through this, so only letters and numbers have to match. Apostrophes
    // are dropped rather than turned into spaces, so "assassins" matches
    // "Assassin's" too. Unlike matching/normalize.ts, non-Latin letters are
    // kept, so Japanese or Cyrillic titles stay searchable.
    function normalizeSearchText(text) {
        // Symbols go first: NFKD would expand "™" into the letters "TM".
        return String(text)
            .replace(/[®™©℠]/g, "")
            .normalize("NFKD")
            .replace(/\p{M}/gu, "")
            .toLowerCase()
            .replace(/['’‘`´]/g, "")
            .replace(/[^\p{L}\p{N}]+/gu, " ")
            .trim();
    }

    function titleMatchesSearch(title, query) {
        const needle = normalizeSearchText(query);
        return needle === "" || normalizeSearchText(title).includes(needle);
    }

    return { normalizeSearchText, titleMatchesSearch };
});
