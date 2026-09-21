import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptCredential, encryptCredential, isEncryptedCredential, parseCredentialEncryptionKey } from "./credentials";

const key = randomBytes(32);

describe("credential encryption", () => {
    it("round-trips credentials with an authenticated ciphertext format", () => {
        const encrypted = encryptCredential("refresh-token-value", key);

        expect(encrypted).not.toContain("refresh-token-value");
        expect(isEncryptedCredential(encrypted)).toBe(true);
        expect(decryptCredential(encrypted, key)).toBe("refresh-token-value");
    });

    it("uses a fresh IV for each encryption", () => {
        expect(encryptCredential("same-value", key)).not.toBe(encryptCredential("same-value", key));
    });

    it("rejects tampered ciphertext", () => {
        const encrypted = encryptCredential("api-key", key);
        const parts = encrypted.split(":");
        const version = parts.slice(0, 2).join(":");
        const iv = parts[2];
        const authTag = parts[3];
        const ciphertext = parts[4];
        const tamperedAuthTag = `${authTag[0] === "A" ? "B" : "A"}${authTag.slice(1)}`;
        const tampered = [version, iv, tamperedAuthTag, ciphertext].join(":");

        expect(() => decryptCredential(tampered, key)).toThrow("Unable to decrypt credential");
    });

    it("leaves legacy plaintext values readable until migration runs", () => {
        expect(decryptCredential("legacy-credential", key)).toBe("legacy-credential");
        expect(isEncryptedCredential("legacy-credential")).toBe(false);
    });

    it("validates the configured key size", () => {
        expect(parseCredentialEncryptionKey(key.toString("base64"))).toEqual(key);
        expect(() => parseCredentialEncryptionKey(randomBytes(31).toString("base64"))).toThrow();
    });
});
