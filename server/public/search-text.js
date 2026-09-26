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

    const ROMAN_NUMERALS = ["", "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x",
        "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"];

    // Titles number sequels either way ("Grand Theft Auto V", "Resident Evil
    // 5"), so a numeric suffix after an acronym also tries its roman form.
    function numberVariants(rest) {
        const variants = [rest];
        if (/^\d+$/.test(rest) && ROMAN_NUMERALS[Number(rest)]) variants.push(ROMAN_NUMERALS[Number(rest)]);
        return variants;
    }

    // Word-aligned at the start; a trailing number must also end a word, so
    // "re5" finds "Resident Evil 5" but not "Resident Evil 50", and "gta5"
    // finds "Grand Theft Auto V" but not "Grand Theft Auto Vice City".
    function titleContainsExpansion(normalizedTitle, expansion, rest) {
        const padded = ` ${normalizedTitle} `;
        const head = normalizeSearchText(expansion);
        if (rest === "") return padded.includes(` ${head}`);
        const numeric = /^\d+$/.test(rest);
        return numberVariants(rest).some((variant) =>
            padded.includes(` ${head} ${variant}${numeric ? " " : ""}`));
    }

    // acronyms maps a normalized acronym ("gta") to the text it expands to
    // ("grand theft auto"). The acronym has to lead the query, optionally
    // followed by more words ("ac unity") or a sequel number, spaced or not
    // ("re 5", "re5" - see #216).
    function titleMatchesSearch(title, query, acronyms = DEFAULT_ACRONYMS) {
        const needle = normalizeSearchText(query);
        if (needle === "") return true;
        const normalizedTitle = normalizeSearchText(title);
        if (normalizedTitle.includes(needle)) return true;
        if (acronyms[needle]) return titleContainsExpansion(normalizedTitle, acronyms[needle], "");

        const spaceAt = needle.indexOf(" ");
        if (spaceAt > 0) {
            const expansion = acronyms[needle.slice(0, spaceAt)];
            if (expansion && titleContainsExpansion(normalizedTitle, expansion, needle.slice(spaceAt + 1))) return true;
        }

        const glued = /^(\p{L}+)(\d+)$/u.exec(needle);
        if (glued && acronyms[glued[1]]) return titleContainsExpansion(normalizedTitle, acronyms[glued[1]], glued[2]);
        return false;
    }

    return { normalizeSearchText, titleMatchesSearch, DEFAULT_ACRONYMS };
});
