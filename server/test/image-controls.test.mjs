import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { gameCoverMarkup, markCoverImageFailed } = require("../public/image-controls.js");

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
