import { pool } from "../db";
import { config } from "../config";
import { encryptCredential, isEncryptedCredential } from "../security/credentials";

async function main(): Promise<void> {
    const client = await pool.connect();
    let updated = 0;

    try {
        await client.query("begin");
        const result = await client.query<{ id: string; access_token: string | null; refresh_token: string | null }>(
            "select id, access_token, refresh_token from user_platform_accounts for update"
        );

        for (const account of result.rows) {
            const accessToken = account.access_token && !isEncryptedCredential(account.access_token)
                ? encryptCredential(account.access_token, config.credentialEncryptionKey)
                : account.access_token;
            const refreshToken = account.refresh_token && !isEncryptedCredential(account.refresh_token)
                ? encryptCredential(account.refresh_token, config.credentialEncryptionKey)
                : account.refresh_token;

            if (accessToken === account.access_token && refreshToken === account.refresh_token) continue;
            await client.query(
                "update user_platform_accounts set access_token = $1, refresh_token = $2 where id = $3",
                [accessToken, refreshToken, account.id]
            );
            updated++;
        }

        await client.query("commit");
        console.log(`Encrypted credentials for ${updated} account(s).`);
    } catch (err) {
        await client.query("rollback");
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error("Credential encryption migration failed:", err);
    process.exitCode = 1;
});
