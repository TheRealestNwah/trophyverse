import { describe, expect, it } from "vitest";
import { csrfTokensMatch } from "./csrf";

describe("CSRF token comparison", () => {
    it("accepts the exact session token", () => {
        expect(csrfTokensMatch("session-token", "session-token")).toBe(true);
    });

    it("rejects missing, different, or differently sized tokens", () => {
        expect(csrfTokensMatch(undefined, "session-token")).toBe(false);
        expect(csrfTokensMatch("session-token", undefined)).toBe(false);
        expect(csrfTokensMatch("session-token", "other-token")).toBe(false);
        expect(csrfTokensMatch("session-token", "session-token-extra")).toBe(false);
    });
});
