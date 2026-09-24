import { beforeAll, afterAll, describe, expect, it } from "vitest";

const integrationEnabled = process.env.INTEGRATION_TESTS === "true";
const integration = integrationEnabled ? describe : describe.skip;

integration("getFunStats tier totals", () => {
    let pool: import("pg").Pool;
    let canonicalStore: typeof import("../sync/canonicalStore");
    let getFunStats: typeof import("./queries").getFunStats;
    let userId: string;
    let accountId: string;
    let gameId: string;

    beforeAll(async () => {
        if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");
        ({ pool } = await import("../db"));
        canonicalStore = await import("../sync/canonicalStore");
        ({ getFunStats } = await import("./queries"));

        await pool.query("truncate table users, games, canonical_achievements cascade");

        const user = await pool.query("insert into users (username) values ($1) returning id", ["fun-stats-user"]);
        userId = user.rows[0].id;
        const account = await pool.query(
            `insert into user_platform_accounts
                (user_id, platform_id, platform_account_id, display_name)
             values ($1, 'steam', $2, $3) returning id`,
            [userId, "fun-stats-steam-id", "Fun Stats User"]
        );
        accountId = account.rows[0].id;

        gameId = await canonicalStore.getOrCreateCanonicalGame("steam", "fun-stats-app", "Fun Stats Game");
        await canonicalStore.recordOwnership(accountId, gameId);
    });

    afterAll(async () => {
        await pool?.end();
    });

    it("counts unlocked achievements per tier across the user's library", async () => {
        // Two platinums, one gold, three silvers, zero bronzes - forced via
        // nativeTier so this doesn't depend on the rarity-fallback thresholds.
        const tierPlan: { tier: string; count: number }[] = [
            { tier: "platinum", count: 2 },
            { tier: "gold", count: 1 },
            { tier: "silver", count: 3 },
            { tier: "bronze", count: 0 },
        ];

        let achievementIndex = 0;
        for (const { tier, count } of tierPlan) {
            for (let i = 0; i < count; i++) {
                achievementIndex++;
                const linkId = await canonicalStore.getOrCreateAchievementLink(
                    gameId,
                    "steam",
                    "fun-stats-app",
                    `fun-stats-achievement-${achievementIndex}`,
                    `Achievement ${achievementIndex}`,
                    undefined,
                    undefined,
                    { tier, tierSource: "psn_native" }
                );
                await canonicalStore.recordUnlock(accountId, linkId, new Date(`2026-01-${10 + achievementIndex}T00:00:00Z`));
            }
        }

        const stats = await getFunStats(userId);

        expect(stats.totalPlatinums).toBe(2);
        expect(stats.totalGold).toBe(1);
        expect(stats.totalSilver).toBe(3);
        expect(stats.totalBronze).toBe(0);
    });
});
