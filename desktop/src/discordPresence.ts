import { Client } from "@xhayper/discord-rpc";

// Set by the user after creating their own app at discord.com/developers/
// applications (see #195) - there's no way to ship a working client ID in
// this repo, since it identifies a specific Discord application the user
// registers themselves. Presence quietly does nothing until it's set.
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || "";

const UPDATE_INTERVAL_MS = 15_000;

interface PresenceData {
    enabled: boolean;
    username: string | null;
    level: number | null;
    totalPoints: number | null;
}

let client: Client | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let ready = false;
const startTimestamp = new Date();

async function fetchPresenceData(serverUrl: string): Promise<PresenceData | null> {
    try {
        const res = await fetch(`${serverUrl}/api/setup/discord-presence-data`);
        if (!res.ok) return null;
        return (await res.json()) as PresenceData;
    } catch {
        // Server not reachable yet, or shutting down - not worth logging on
        // every poll tick.
        return null;
    }
}

async function updateActivity(serverUrl: string): Promise<void> {
    if (!client || !ready) return;
    const data = await fetchPresenceData(serverUrl);
    if (!data || !data.enabled) {
        await client.user?.clearActivity().catch(() => {});
        return;
    }
    await client.user
        ?.setActivity({
            details: data.username ? `Tracking ${data.username}'s achievements` : "Tracking achievements",
            state: data.level != null ? `Level ${data.level} · ${(data.totalPoints ?? 0).toLocaleString()} points` : undefined,
            startTimestamp,
            instance: false,
        })
        .catch((err: unknown) => console.error("Discord presence update failed:", err));
}

// Connects to a local Discord client over its IPC socket/named pipe (see
// #195) - never over the network, so it's a no-op when Discord isn't
// installed or running, matching the app's offline-first design. Call once
// the local server is up; safe to call even with no DISCORD_CLIENT_ID
// configured (it just never connects).
export function startDiscordPresence(serverUrl: string): void {
    if (!DISCORD_CLIENT_ID) {
        console.log("Discord Rich Presence: no DISCORD_CLIENT_ID configured, skipping.");
        return;
    }

    client = new Client({ clientId: DISCORD_CLIENT_ID });
    client.on("ready", () => {
        ready = true;
        console.log("Discord Rich Presence connected.");
        void updateActivity(serverUrl);
    });
    client.on("disconnected", () => {
        ready = false;
    });

    // A failed login just means Discord isn't running/reachable right now -
    // expected and not fatal to the app.
    client.login().catch((err: unknown) => {
        console.log(`Discord Rich Presence unavailable: ${err instanceof Error ? err.message : String(err)}`);
    });

    pollTimer = setInterval(() => void updateActivity(serverUrl), UPDATE_INTERVAL_MS);
}

export async function stopDiscordPresence(): Promise<void> {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    ready = false;
    try {
        await client?.user?.clearActivity();
        await client?.destroy();
    } catch {
        // Already disconnected - nothing to clean up.
    }
    client = null;
}
