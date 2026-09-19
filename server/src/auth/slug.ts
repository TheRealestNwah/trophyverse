import { pool } from "../db";

function slugify(name: string): string {
    const base = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return base || "player";
}

// Generated once per user from their display name at signup - stable for
// the lifetime of the account (a public profile's URL shouldn't change
// just because someone edited their Steam name later). Collisions get a
// short numeric suffix.
export async function generateUniqueSlug(displayName: string): Promise<string> {
    const base = slugify(displayName);
    let candidate = base;
    let suffix = 1;

    while (true) {
        const existing = await pool.query("select 1 from users where public_slug = $1", [candidate]);
        if (!existing.rows[0]) return candidate;
        suffix++;
        candidate = `${base}-${suffix}`;
    }
}
