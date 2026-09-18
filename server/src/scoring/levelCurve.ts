// PSN's own post-2020 leveling curve is undisclosed, so this approximates
// its shape instead of replicating exact numbers: quick early levels, a
// steep grind at the top, cap at 999. Tuned so a large, long-played Steam
// library (~250k points) lands around level 35 - see docs/data-model.md.
const BASE = 50;
const EXPONENT = 2.4;
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
