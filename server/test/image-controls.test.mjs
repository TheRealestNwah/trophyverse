import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { gameCoverMarkup, markCoverImageFailed, handleAchievementIconError } = require("../public/image-controls.js");

function fakeIcon(src) {
    const replacements = [];
    return {
        replacements,
        src,
        dataset: {},
        isConnected: true,
        ownerDocument: { createElement: (tag) => ({ tag, className: "" }) },
        replaceWith: (node) => replacements.push(node),
    };
}

describe("achievement icon load failures", () => {
    it("retries a failed icon once before giving up", () => {
        const icon = fakeIcon("https://cdn.example.test/icon.png");
        const scheduled = [];

        handleAchievementIconError(icon, (fn, ms) => scheduled.push({ fn, ms }));
        icon.src = "";
        scheduled[0].fn();

        expect(scheduled).toHaveLength(1);
        expect(scheduled[0].ms).toBeGreaterThan(0);
        expect(icon.src).toBe("https://cdn.example.test/icon.png");
        expect(icon.replacements).toEqual([]);
    });

    it("skips the retry if the icon was removed from the page in the meantime", () => {
        const icon = fakeIcon("https://cdn.example.test/icon.png");
        let retry;

        handleAchievementIconError(icon, (fn) => (retry = fn));
        icon.src = "";
        icon.isConnected = false;
        retry();

        expect(icon.src).toBe("");
    });

    it("swaps in the no-icon placeholder when the retry also fails", () => {
        const icon = fakeIcon("https://cdn.example.test/icon.png");

        handleAchievementIconError(icon, () => {});
        handleAchievementIconError(icon, () => {});

        expect(icon.replacements).toEqual([{ tag: "div", className: "achievement-icon" }]);
    });
});

describe("game cover controls", () => {
    it("renders a visible, accessible add-cover button when no image exists", () => {
        const markup = gameCoverMarkup(null);

        expect(markup).toContain('type="button"');
        expect(markup).toContain('aria-label="Change game cover"');
        expect(markup).toContain("game-cover-placeholder");
        expect(markup).not.toContain("has-cover");
        expect(markup).not.toContain("<img");
    });

    it("renders existing artwork without losing the persistent placeholder", () => {
        const markup = gameCoverMarkup('https://example.test/cover?name="quoted"');

        expect(markup).toContain("game-cover-wrap has-cover");
        expect(markup).toContain("game-cover-placeholder");
        expect(markup).toContain('src="https://example.test/cover?name=&quot;quoted&quot;"');
    });

    it("reveals the placeholder when an image fails to load", () => {
        const removed = [];
        const image = {
            hidden: false,
            closest: () => ({ classList: { remove: (name) => removed.push(name) } }),
        };

        markCoverImageFailed(image);

        expect(image.hidden).toBe(true);
        expect(removed).toEqual(["has-cover"]);
    });
});
