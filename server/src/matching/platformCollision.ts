export function hasPlatformCollision(platformGroups: string[][]): boolean {
    const seen = new Set<string>();
    for (const platforms of platformGroups) {
        for (const platform of platforms) {
            if (seen.has(platform)) return true;
            seen.add(platform);
        }
    }
    return false;
}
