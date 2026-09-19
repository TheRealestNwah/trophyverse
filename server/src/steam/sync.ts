import { pool } from "../db";
import {
    getOwnedGames,
    getSchemaForGame,
    getPlayerAchievements,
    getGlobalAchievementPercentages,
} from "./client";
import { getOrCreateCanonicalGame, getOrCreateAchievementLink, recordUnlock, recordOwnership } from "../sync/canonicalStore";
import { normalizeRarityTiersForGame } from "../scoring/rarityNormalization";
import { SyncSummary } from "../sync/types";

interface SteamSyncState {
    playtimeForever: number;
    rtimeLastPlayed: number;
}

async function getSyncState(userPlatformAccountId: string): Promise<Map<number, SteamSyncState>> {
    const result = await pool.query(
        "select appid, playtime_forever, rtime_last_played from steam_game_sync_state where user_platform_account_id = $1",
        [userPlatformAccountId]
    );
    return new Map(
        result.rows.map((r) => [r.appid, { playtimeForever: r.playtime_forever, rtimeLastPlayed: r.rtime_last_played }])
    );
}

async function saveSyncState(userPlatformAccountId: string, appid: number, playtimeForever: number, rtimeLastPlayed: number) {
    await pool.query(
        `insert into steam_game_sync_state (user_platform_account_id, appid, playtime_forever, rtime_last_played)
         values ($1, $2, $3, $4)
         on conflict (user_platform_account_id, appid) do update set
            playtime_forever = excluded.playtime_forever,
            rtime_last_played = excluded.rtime_last_played`,
        [userPlatformAccountId, appid, playtimeForever, rtimeLastPlayed]
    );
}

export async function syncSteamAccount(userPlatformAccountId: string, steamId: string): Promise<SyncSummary> {
    const games = await getOwnedGames(steamId);
    const syncState = await getSyncState(userPlatformAccountId);
    let achievementsUnlocked = 0;

    for (const game of games) {
        // Neither field can change without the user actually playing the
        // game, and achievement unlocks only ever happen during play - so if
        // both are unchanged since last sync, nothing about this game
        // (including a from-scratch "does it have achievements" check) needs
        // re-fetching. Comparing both rather than just playtime_forever
        // closes the edge case of an achievement unlocking within the same
        // whole-minute window as the previous sync's playtime reading.
        // Verified live against a real 494-game library that both fields are
        // present and well-formed (see PR #21's test plan).
        const previous = syncState.get(game.appid);
        if (previous && previous.playtimeForever === game.playtime_forever && previous.rtimeLastPlayed === game.rtime_last_played) {
            continue;
        }

        const schema = await getSchemaForGame(game.appid);
        await saveSyncState(userPlatformAccountId, game.appid, game.playtime_forever, game.rtime_last_played);
        if (schema.length === 0) continue; // game has no achievements

        const [playerAchievements, globalPercentages] = await Promise.all([
            getPlayerAchievements(game.appid, steamId),
            getGlobalAchievementPercentages(game.appid),
        ]);
        const unlockedByName = new Map(playerAchievements.map((a) => [a.apiname, a]));

        // Steam's CDN serves box art at a predictable per-appid URL - no API
        // call needed, confirmed live (200) against a real appid.
        const coverImageUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`;
        const gameId = await getOrCreateCanonicalGame("steam", String(game.appid), game.name, coverImageUrl);
        await recordOwnership(userPlatformAccountId, gameId);

        for (const achievement of schema) {
            const linkId = await getOrCreateAchievementLink(
                gameId,
                "steam",
                String(game.appid),
                achievement.name,
                achievement.displayName,
                achievement.description,
                globalPercentages.get(achievement.name),
                undefined,
                achievement.iconUrl
            );

            const unlock = unlockedByName.get(achievement.name);
            if (!unlock?.achieved) continue;

            const isNew = await recordUnlock(userPlatformAccountId, linkId, new Date(unlock.unlocktime * 1000));
            if (isNew) achievementsUnlocked++;
        }

        // This game's full achievement list (and thus its rarity
        // distribution) is only known now that every achievement has been
        // inserted - re-resolve tiers with that context (see issue #10).
        await normalizeRarityTiersForGame(gameId);
    }

    await pool.query("update user_platform_accounts set last_synced_at = now() where id = $1", [
        userPlatformAccountId,
    ]);

    return { gamesProcessed: games.length, achievementsUnlocked };
}
