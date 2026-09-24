import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadOrCreateSecrets } from "./secrets";
import { parseCredentialEncryptionKey } from "../security/credentials";

let dataDir: string;

beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "uam-secrets-"));
});

afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("loadOrCreateSecrets", () => {
    it("generates a valid session secret and 32-byte encryption key on first run", () => {
        const secrets = loadOrCreateSecrets(path.join(dataDir, "nested"));
        expect(secrets.sessionSecret.length).toBeGreaterThanOrEqual(32);
        expect(parseCredentialEncryptionKey(secrets.credentialEncryptionKey)).toHaveLength(32);
        expect(fs.existsSync(path.join(dataDir, "nested", "secrets.json"))).toBe(true);
    });

    it("returns the same secrets on every later run", () => {
        const first = loadOrCreateSecrets(dataDir);
        expect(loadOrCreateSecrets(dataDir)).toEqual(first);
    });

    it("refuses to silently replace a malformed secrets file", () => {
        fs.writeFileSync(path.join(dataDir, "secrets.json"), JSON.stringify({ sessionSecret: "x" }));
        expect(() => loadOrCreateSecrets(dataDir)).toThrow(/malformed/);
    });
});
