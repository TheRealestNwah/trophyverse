import { config } from "../config";
import { pool } from "../db";
import { decryptCredential, encryptCredential } from "../security/credentials";

const SETTING_KEY = "steamgriddb_api_key";
export const STEAMGRIDDB_API = "https://www.steamgriddb.com/api/v2";

export async function getSteamGridDbApiKey(): Promise<string | undefined> {
    const result = await pool.query("select value from app_settings where key = $1", [SETTING_KEY]);
    const stored = result.rows[0]?.value as string | undefined;
    return stored ? decryptCredential(stored, config.credentialEncryptionKey) : undefined;
}

// Any authenticated lookup works as a probe; 220 (Half-Life 2) always exists.
export async function isValidSteamGridDbApiKey(apiKey: string): Promise<boolean> {
    const res = await fetch(`${STEAMGRIDDB_API}/games/steam/220`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (res.status === 401 || res.status === 403) return false;
    if (!res.ok) throw new Error(`SteamGridDB didn't respond (${res.status}); try again in a moment`);
    return true;
}

export async function saveSteamGridDbApiKey(apiKey: string): Promise<void> {
    await pool.query(
        `insert into app_settings (key, value) values ($1, $2)
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [SETTING_KEY, encryptCredential(apiKey, config.credentialEncryptionKey)]
    );
}

export async function removeSteamGridDbApiKey(): Promise<void> {
    await pool.query("delete from app_settings where key = $1", [SETTING_KEY]);
}
