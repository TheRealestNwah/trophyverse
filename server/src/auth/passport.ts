import passport from "passport";
import { Strategy as SteamStrategy, SteamProfile } from "passport-steam";
import { config } from "../config";
import { pool } from "../db";

passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
    try {
        const result = await pool.query("select * from users where id = $1", [id]);
        done(null, result.rows[0] ?? false);
    } catch (err) {
        done(err);
    }
});

async function findOrCreateSteamUser(profile: SteamProfile): Promise<Express.User> {
    const steamId = profile.id;

    const existing = await pool.query(
        `select u.* from users u
         join user_platform_accounts upa on upa.user_id = u.id
         where upa.platform_id = 'steam' and upa.platform_account_id = $1`,
        [steamId]
    );
    if (existing.rows[0]) return existing.rows[0];

    const client = await pool.connect();
    try {
        await client.query("begin");
        const userResult = await client.query(
            "insert into users (username) values ($1) returning *",
            [profile.displayName]
        );
        const user = userResult.rows[0];
        await client.query(
            `insert into user_platform_accounts (user_id, platform_id, platform_account_id, display_name)
             values ($1, 'steam', $2, $3)`,
            [user.id, steamId, profile.displayName]
        );
        await client.query("commit");
        return user;
    } catch (err) {
        await client.query("rollback");
        throw err;
    } finally {
        client.release();
    }
}

// Re-registered whenever the Steam Web API key changes; passport replaces a
// strategy registered under the same name.
export function configureSteamStrategy(apiKey: string): void {
    passport.use(
        new SteamStrategy(
            {
                returnURL: `${config.baseUrl}/auth/steam/return`,
                realm: config.baseUrl,
                apiKey,
            },
            (_identifier, profile, done) => {
                findOrCreateSteamUser(profile)
                    .then((user) => done(null, user))
                    .catch((err) => done(err));
            }
        )
    );
}

export { passport };
