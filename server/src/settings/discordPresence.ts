import { pool } from "../db";

const SETTING_KEY = "discord_rich_presence_enabled";

// On by default (see #195) - only an explicit "off" row turns it off, so a
// user who never touches the setting gets presence for free.
export async function getDiscordPresenceEnabled(): Promise<boolean> {
    const result = await pool.query("select value from app_settings where key = $1", [SETTING_KEY]);
    return result.rows[0] ? result.rows[0].value === "true" : true;
}

export async function setDiscordPresenceEnabled(enabled: boolean): Promise<void> {
    await pool.query(
        `insert into app_settings (key, value) values ($1, $2)
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [SETTING_KEY, String(enabled)]
    );
}
