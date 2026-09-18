import { config } from "../config";

// Xbox Live has no single OAuth step: a Microsoft account token has to be
// exchanged twice more (XASU, then XSTS) before it's usable against any
// xboxlive.com API. See docs/data-model.md and ROADMAP.md for why this
// (rather than a wrapper like OpenXBL) was the chosen approach - no
// third-party dependency, at the cost of this multi-step dance.
const AUTHORIZE_URL = "https://login.live.com/oauth20_authorize.srf";
const TOKEN_URL = "https://login.live.com/oauth20_token.srf";
const XASU_URL = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_URL = "https://xsts.auth.xboxlive.com/xsts/authorize";
const PROFILE_URL = "https://profile.xboxlive.com/users/me/profile/settings";
const SCOPE = "Xboxlive.signin Xboxlive.offline_access";

function requireXboxConfig(): { clientId: string; clientSecret: string } {
    if (!config.xboxClientId || !config.xboxClientSecret) {
        throw new Error(
            "Xbox integration isn't configured - set XBOX_CLIENT_ID and XBOX_CLIENT_SECRET (see README for how to register the Azure app)."
        );
    }
    return { clientId: config.xboxClientId, clientSecret: config.xboxClientSecret };
}

function redirectUri(): string {
    return `${config.baseUrl}/auth/xbox/callback`;
}

export function getAuthorizeUrl(state: string): string {
    const { clientId } = requireXboxConfig();
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("approval_prompt", "auto");
    url.searchParams.set("scope", SCOPE);
    url.searchParams.set("redirect_uri", redirectUri());
    url.searchParams.set("state", state);
    return url.toString();
}

interface MicrosoftTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

async function postForm(url: string, params: Record<string, string>): Promise<MicrosoftTokenResponse> {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params),
    });
    if (!res.ok) {
        throw new Error(`Microsoft token endpoint failed: ${res.status} ${await res.text()}`);
    }
    return res.json() as Promise<MicrosoftTokenResponse>;
}

export async function exchangeCodeForToken(code: string): Promise<MicrosoftTokenResponse> {
    const { clientId, clientSecret } = requireXboxConfig();
    return postForm(TOKEN_URL, {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri(),
    });
}

export async function refreshAccessToken(refreshToken: string): Promise<MicrosoftTokenResponse> {
    const { clientId, clientSecret } = requireXboxConfig();
    return postForm(TOKEN_URL, {
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        redirect_uri: redirectUri(),
    });
}

interface XboxTokenResponse {
    Token: string;
    DisplayClaims: { xui: Array<{ uhs: string }> };
}

async function postXboxLive(url: string, body: unknown): Promise<XboxTokenResponse> {
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "x-xbl-contract-version": "1",
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        throw new Error(`Xbox Live auth step failed: ${res.status} ${await res.text()}`);
    }
    return res.json() as Promise<XboxTokenResponse>;
}

export interface XboxLiveSession {
    xstsToken: string;
    userHash: string;
    authHeader: string; // ready to use as the Authorization header value
}

export async function authenticateXboxLive(msAccessToken: string): Promise<XboxLiveSession> {
    const userToken = await postXboxLive(XASU_URL, {
        RelyingParty: "http://auth.xboxlive.com",
        TokenType: "JWT",
        Properties: {
            AuthMethod: "RPS",
            SiteName: "user.auth.xboxlive.com",
            RpsTicket: `d=${msAccessToken}`,
        },
    });

    const xsts = await postXboxLive(XSTS_URL, {
        RelyingParty: "http://xboxlive.com",
        TokenType: "JWT",
        Properties: {
            SandboxId: "RETAIL",
            UserTokens: [userToken.Token],
        },
    });

    const userHash = xsts.DisplayClaims.xui[0].uhs;
    return {
        xstsToken: xsts.Token,
        userHash,
        authHeader: `XBL3.0 x=${userHash};${xsts.Token}`,
    };
}

export interface XboxProfile {
    xuid: string;
    gamertag: string;
}

export async function getXboxProfile(session: XboxLiveSession): Promise<XboxProfile> {
    const url = new URL(PROFILE_URL);
    url.searchParams.set("settings", "Gamertag");
    const res = await fetch(url, {
        headers: {
            Authorization: session.authHeader,
            "x-xbl-contract-version": "3",
            Accept: "application/json",
        },
    });
    if (!res.ok) {
        throw new Error(`Xbox profile lookup failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as {
        profileUsers: Array<{ id: string; settings: Array<{ id: string; value: string }> }>;
    };
    const profile = data.profileUsers[0];
    const gamertag = profile.settings.find((s) => s.id === "Gamertag")?.value ?? profile.id;
    return { xuid: profile.id, gamertag };
}

// Full chain from a stored refresh token to a ready-to-use Xbox Live
// session. Called at the start of every sync since XSTS tokens are
// short-lived and not worth persisting separately.
export async function resumeXboxSession(
    refreshToken: string
): Promise<{ session: XboxLiveSession; newRefreshToken: string }> {
    const tokens = await refreshAccessToken(refreshToken);
    const session = await authenticateXboxLive(tokens.access_token);
    return { session, newRefreshToken: tokens.refresh_token };
}
