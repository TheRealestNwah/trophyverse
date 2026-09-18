// PSN's own leveling curve is undisclosed, so this approximates its shape
// instead of replicating exact numbers: quick early levels, a steep grind at
// the top, cap at 999. EXPONENT is fit against a real calibration point
// rather than guessed - a real PSN account at level 323 has 81,030 real
// trophy points (summed with the same bronze=15/silver=30/gold=90/
// platinum=300 values this app uses), so points_required(323) is pinned
// there. An earlier EXPONENT of 2.4 was a guess with no such anchor and was
// off by roughly three orders of magnitude at high levels - it demanded
// ~43,000,000 points for level 300, leaving that same real account
// (81,030 combined points) stuck at level 31. See docs/data-model.md.
const BASE = 50;
const EXPONENT = 1.28;
export const MAX_LEVEL = 999;

export function pointsRequiredForLevel(level: number): number {
    if (level <= 1) return 0;
    return Math.round(BASE * Math.pow(level - 1, EXPONENT));
}

export function generateLevelThresholds(): Array<{ level: number; pointsRequired: number }> {
    const thresholds = [];
    for (let level = 1; level <= MAX_LEVEL; level++) {
        thresholds.push({ level, pointsRequired: pointsRequiredForLevel(level) });
    }
    return thresholds;
}
