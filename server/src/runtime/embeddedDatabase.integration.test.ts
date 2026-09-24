import fs from "fs";
import os from "os";
import path from "path";
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { startEmbeddedDatabase } from "./embeddedDatabase";

const enabled = process.env.EMBEDDED_PG_TESTS === "true";
const suite = enabled ? describe : describe.skip;

async function query<T>(url: string, sql: string): Promise<T[]> {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
        return (await client.query(sql)).rows as T[];
    } finally {
        await client.end();
    }
}

suite("embedded PostgreSQL", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "uam-embedded-pg-"));

    afterAll(() => {
        fs.rmSync(dataDir, { recursive: true, force: true });
    });

    it("initialises a cluster on first start and keeps data across restarts", async () => {
        const first = await startEmbeddedDatabase(dataDir);
        try {
            const [{ version }] = await query<{ version: string }>(first.url, "select current_setting('server_version') as version");
            expect(version).toMatch(/^17\./);
            const [{ listen }] = await query<{ listen: string }>(first.url, "select current_setting('listen_addresses') as listen");
            expect(listen).toBe("127.0.0.1");
            await query(first.url, "create table persisted (value text); insert into persisted values ('kept')");
        } finally {
            await first.stop();
        }

        const second = await startEmbeddedDatabase(dataDir);
        try {
            expect(await query(second.url, "select value from persisted")).toEqual([{ value: "kept" }]);
        } finally {
            await second.stop();
        }
    }, 180_000);

    it("recovers when a previous run never stopped its database", async () => {
        const orphaned = await startEmbeddedDatabase(dataDir);
        const restarted = await startEmbeddedDatabase(dataDir);
        try {
            expect(await query(restarted.url, "select value from persisted")).toEqual([{ value: "kept" }]);
            await expect(query(orphaned.url, "select 1")).rejects.toThrow();
        } finally {
            await restarted.stop();
        }
    }, 180_000);
});
