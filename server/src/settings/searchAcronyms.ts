import { pool } from "../db";

const SETTING_KEY = "custom_search_acronyms";

export interface SearchAcronym {
    acronym: string;
    expansion: string;
}

// User-defined additions to the built-in acronym list in
// public/search-text.js (see #194) - e.g. "bg3" -> "baldur's gate". Stored
// as a single JSON blob in app_settings, like other small app-level config,
// since this is a short list a user edits occasionally, not a table that
// needs per-row queries.
export async function getSearchAcronyms(): Promise<SearchAcronym[]> {
    const result = await pool.query("select value from app_settings where key = $1", [SETTING_KEY]);
    if (!result.rows[0]) return [];
    try {
        const parsed = JSON.parse(result.rows[0].value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export async function saveSearchAcronyms(acronyms: SearchAcronym[]): Promise<void> {
    await pool.query(
        `insert into app_settings (key, value) values ($1, $2)
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [SETTING_KEY, JSON.stringify(acronyms)]
    );
}
