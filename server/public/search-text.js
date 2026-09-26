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

    // Common gaming franchise acronyms (see #194) - typing "GTA" should find
    // Grand Theft Auto titles without the user spelling the franchise out.
    // Deliberately a modest, unambiguous starter set rather than every
    // acronym anyone might use; users can add their own via Settings
    // (server/src/settings/searchAcronyms.ts), which win on a key collision.
    const DEFAULT_ACRONYMS = {
        gta: "grand theft auto",
        mgs: "metal gear solid",
        ac: "assassin's creed",
        re: "resident evil",
        ff: "final fantasy",
        gow: "god of war",
        cod: "call of duty",
        tlou: "the last of us",
        botw: "breath of the wild",
        totk: "tears of the kingdom",
        er: "elden ring",
        rdr: "red dead redemption",
        nfs: "need for speed",
    };

    // acronyms maps a normalized acronym ("gta") to the text it expands to
    // ("grand theft auto"). Only the whole (normalized) query is looked up -
    // "gta 5" doesn't expand - keeping the match predictable rather than
    // guessing which word in a longer query is the acronym.
    function titleMatchesSearch(title, query, acronyms = DEFAULT_ACRONYMS) {
        const needle = normalizeSearchText(query);
        if (needle === "") return true;
        const normalizedTitle = normalizeSearchText(title);
        if (normalizedTitle.includes(needle)) return true;
        const expansion = acronyms[needle];
        return expansion ? normalizedTitle.includes(normalizeSearchText(expansion)) : false;
    }

    return { normalizeSearchText, titleMatchesSearch, DEFAULT_ACRONYMS };
});
