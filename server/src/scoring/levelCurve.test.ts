import { describe, expect, it } from "vitest";
import { pointsRequiredForLevel, generateLevelThresholds, MAX_LEVEL } from "./levelCurve";

describe("pointsRequiredForLevel", () => {
    it("requires zero points for level 1 and below", () => {
        expect(pointsRequiredForLevel(1)).toBe(0);
        expect(pointsRequiredForLevel(0)).toBe(0);
    });

    it("is strictly increasing as level rises", () => {
        let previous = pointsRequiredForLevel(1);
        for (let level = 2; level <= 50; level++) {
            const current = pointsRequiredForLevel(level);
            expect(current).toBeGreaterThan(previous);
            previous = current;
        }
    });

    it("stays anchored near the real calibration point (level 323 ~ 81,030 points)", () => {
        // See levelCurve.ts's own comment: EXPONENT was fit against this real
        // PSN account so a regression here would silently break the curve
        // for every future user, the same way an earlier ungrounded guess did.
        const points = pointsRequiredForLevel(323);
        expect(points).toBeGreaterThan(70000);
        expect(points).toBeLessThan(95000);
    });
});

describe("generateLevelThresholds", () => {
    it("produces one entry per level from 1 to MAX_LEVEL", () => {
        const thresholds = generateLevelThresholds();
        expect(thresholds).toHaveLength(MAX_LEVEL);
        expect(thresholds[0]).toEqual({ level: 1, pointsRequired: 0 });
        expect(thresholds[thresholds.length - 1].level).toBe(MAX_LEVEL);
    });

    it("matches pointsRequiredForLevel for every entry", () => {
        const thresholds = generateLevelThresholds();
        for (const { level, pointsRequired } of thresholds) {
            expect(pointsRequired).toBe(pointsRequiredForLevel(level));
        }
    });
});
