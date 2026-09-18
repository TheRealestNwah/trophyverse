import { pool } from "../db";

export interface PlatformIdentity {
    platformId: string;
    platformAccountId: string;
    displayName: string;
    accessToken?: string;
    refreshToken?: string;
}

// Shared by every platform's login/callback route. If currentUserId is set
// (the browser already has a session - "link this platform to my account"),
// the identity is attached to that user instead of creating a new one.
// Otherwise it behaves like a normal "sign in with X": find the user this
// platform account already belongs to, or create one.
export async function linkOrCreateUser(
    identity: PlatformIdentity,
    currentUserId?: string
): Promise<{ id: string; email: string | null; username: string; created_at: Date }> {
    if (currentUserId) {
        await pool.query(
            `insert into user_platform_accounts (user_id, platform_id, platform_account_id, display_name, access_token, refresh_token)
             values ($1, $2, $3, $4, $5, $6)
             on conflict (user_id, platform_id) do update
                set platform_account_id = excluded.platform_account_id,
                    display_name = excluded.display_name,
                    access_token = excluded.access_token,
                    refresh_token = excluded.refresh_token`,
            [
                currentUserId,
                identity.platformId,
                identity.platformAccountId,
                identity.displayName,
                identity.accessToken ?? null,
                identity.refreshToken ?? null,
            ]
        );
        const user = await pool.query("select * from users where id = $1", [currentUserId]);
        return user.rows[0];
    }

    const existing = await pool.query(
        `select u.* from users u
         join user_platform_accounts upa on upa.user_id = u.id
         where upa.platform_id = $1 and upa.platform_account_id = $2`,
        [identity.platformId, identity.platformAccountId]
    );
    if (existing.rows[0]) {
        await pool.query(
            `update user_platform_accounts set access_token = $1, refresh_token = $2, display_name = $3
             where platform_id = $4 and platform_account_id = $5`,
            [identity.accessToken ?? null, identity.refreshToken ?? null, identity.displayName, identity.platformId, identity.platformAccountId]
        );
        return existing.rows[0];
    }

    const client = await pool.connect();
    try {
        await client.query("begin");
        const userResult = await client.query(
            "insert into users (username) values ($1) returning *",
            [identity.displayName]
        );
        const user = userResult.rows[0];
        await client.query(
            `insert into user_platform_accounts (user_id, platform_id, platform_account_id, display_name, access_token, refresh_token)
             values ($1, $2, $3, $4, $5, $6)`,
            [
                user.id,
                identity.platformId,
                identity.platformAccountId,
                identity.displayName,
                identity.accessToken ?? null,
                identity.refreshToken ?? null,
            ]
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
