declare module "passport-steam" {
    import { Strategy as PassportStrategy } from "passport";

    export interface SteamProfile {
        id: string;
        displayName: string;
        _json: Record<string, unknown>;
    }

    export interface SteamStrategyOptions {
        returnURL: string;
        realm: string;
        apiKey: string;
    }

    export type VerifyCallback = (
        identifier: string,
        profile: SteamProfile,
        done: (err: Error | null, user?: unknown) => void
    ) => void;

    export class Strategy extends PassportStrategy {
        constructor(options: SteamStrategyOptions, verify: VerifyCallback);
    }
}
