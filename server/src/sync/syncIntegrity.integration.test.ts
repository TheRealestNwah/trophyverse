import { beforeAll, afterAll, describe, expect, it } from "vitest";

const integrationEnabled = process.env.INTEGRATION_TESTS === "true";
const integration = integrationEnabled ? describe : describe.skip;

integration("sync data integrity", () => {
    let pool: import("pg").Pool;
    let canonicalStore: typeof import("./canonicalStore");
    let accountId: string;
    let gameId: string;
    let secondGameId: string;
    let achievementLinkId: string;

    beforeAll(async () => {
        if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");
        ({ pool } = await import("../db"));
        canonicalStore = await import("./canonicalStore");

        await pool.query("truncate table users, games, canonical_achievements cascade");

        const user = await pool.query("insert into users (username) values ($1) returning id", ["integration-user"]);
        const account = await pool.query(
            `insert into user_platform_accounts
                (user_id, platform_id, platform_account_id, display_name)
             values ($1, 'steam', $2, $3) returning id`,
            [user.rows[0].id, "integration-steam-id", "Integration User"]
        );
        accountId = account.rows[0].id;
    });

    afterAll(async () => {
        await pool?.end();
    });

    it("keeps repeated game and achievement ingestion idempotent", async () => {
        gameId = await canonicalStore.getOrCreateCanonicalGame("steam", "integration-app", "Integration Game");
        expect(await canonicalStore.getOrCreateCanonicalGame("steam", "integration-app", "Integration Game")).toBe(gameId);

        achievementLinkId = await canonicalStore.getOrCreateAchievementLink(
            gameId,
            "steam",
            "integration-app",
            "integration-achievement",
            "Integration Achievement",
            "An integration-test achievement",
            25
        );
        expect(
            await canonicalStore.getOrCreateAchievementLink(
                gameId,
                "steam",
                "integration-app",
                "integration-achievement",
                "Integration Achievement",
                "An integration-test achievement",
                25
            )
        ).toBe(achievementLinkId);

        await canonicalStore.recordOwnership(accountId, gameId);
        await canonicalStore.recordOwnership(accountId, gameId);
        expect(await canonicalStore.recordUnlock(accountId, achievementLinkId, new Date("2026-01-01T00:00:00Z"))).toBe(true);
        expect(await canonicalStore.recordUnlock(accountId, achievementLinkId, new Date("2026-01-02T00:00:00Z"))).toBe(false);

        const counts = await pool.query(`
            select
                (select count(*) from games where id = $1) as games,
                (select count(*) from game_platform_links where platform_id = 'steam' and platform_game_id = 'integration-app') as game_links,
                (select count(*) from canonical_achievements where game_id = $1) as canonical_achievements,
                (select count(*) from achievement_platform_links where platform_id = 'steam' and platform_game_id = 'integration-app') as achievement_links,
                (select count(*) from user_owned_games where user_platform_account_id = $2 and game_id = $1) as ownership,
                (select count(*) from user_achievement_unlocks where user_platform_account_id = $2 and achievement_platform_link_id = $3) as unlocks
        `, [gameId, accountId, achievementLinkId]);
        expect(counts.rows[0]).toMatchObject({
            games: "1",
            game_links: "1",
            canonical_achievements: "1",
            achievement_links: "1",
            ownership: "1",
            unlocks: "1",
        });
    });

    it("reconciles a missing game only after three consecutive reports", async () => {
        secondGameId = await canonicalStore.getOrCreateCanonicalGame("steam", "integration-app-2", "Integration Game 2");
        await canonicalStore.recordOwnership(accountId, secondGameId);

        expect(await canonicalStore.reconcileMissingOwnership(accountId, [secondGameId])).toEqual({
            gamesReconciled: 0,
            achievementsRevoked: 0,
        });
        expect(await canonicalStore.reconcileMissingOwnership(accountId, [secondGameId])).toEqual({
            gamesReconciled: 0,
            achievementsRevoked: 0,
        });
        expect(await canonicalStore.reconcileMissingOwnership(accountId, [secondGameId])).toEqual({
            gamesReconciled: 1,
            achievementsRevoked: 1,
        });

        const remaining = await pool.query(
            `select
                (select count(*) from user_owned_games where user_platform_account_id = $1 and game_id = $2) as missing_ownership,
                (select count(*) from user_owned_games where user_platform_account_id = $1 and game_id = $3) as current_ownership,
                (select count(*) from user_achievement_unlocks where user_platform_account_id = $1) as unlocks,
                (select count(*) from game_absence_streaks where user_platform_account_id = $1) as absence_streaks`,
            [accountId, gameId, secondGameId]
        );
        expect(remaining.rows[0]).toEqual({
            missing_ownership: "0",
            current_ownership: "1",
            unlocks: "0",
            absence_streaks: "0",
        });
    });
});
