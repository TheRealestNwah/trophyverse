import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";

export interface GeneratedSecrets {
    sessionSecret: string;
    credentialEncryptionKey: string;
}

const SECRETS_FILE = "secrets.json";

function isGeneratedSecrets(value: unknown): value is GeneratedSecrets {
    const candidate = value as Partial<GeneratedSecrets> | null;
    return typeof candidate?.sessionSecret === "string" && typeof candidate?.credentialEncryptionKey === "string";
}

// Generated once per install and reused forever after: regenerating the
// encryption key would make every stored platform credential undecryptable.
export function loadOrCreateSecrets(dataDir: string): GeneratedSecrets {
    const filePath = path.join(dataDir, SECRETS_FILE);
    if (fs.existsSync(filePath)) {
        const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (!isGeneratedSecrets(parsed)) throw new Error(`${filePath} is malformed; restore it from a backup rather than deleting it`);
        return parsed;
    }

    const secrets: GeneratedSecrets = {
        sessionSecret: randomBytes(48).toString("base64"),
        credentialEncryptionKey: randomBytes(32).toString("base64"),
    };
    fs.mkdirSync(dataDir, { recursive: true });
    try {
        fs.writeFileSync(filePath, JSON.stringify(secrets, null, 2), { flag: "wx", mode: 0o600 });
    } catch (err) {
        // Another process won the race to create it; use theirs.
        if ((err as NodeJS.ErrnoException).code === "EEXIST") return loadOrCreateSecrets(dataDir);
        throw err;
    }
    return secrets;
}
