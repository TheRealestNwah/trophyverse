import express, { ErrorRequestHandler } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import path from "path";
import { config } from "./config";
import { checkDatabaseConnection, pool } from "./db";
import { passport } from "./auth/passport";
import { authRouter } from "./auth/routes";
import { steamRouter } from "./steam/routes";
import { xboxRouter } from "./xbox/routes";
import { psnRouter } from "./psn/routes";
import { retroRouter } from "./retro/routes";
import { gogRouter } from "./gog/routes";
import { scoreRouter } from "./scoring/routes";
import { gamesRouter } from "./games/routes";
import { matchingRouter } from "./matching/routes";
import { publicRouter } from "./public/routes";
import { startScheduler } from "./scheduler";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { csrfProtection } from "./middleware/csrf";
import { Server } from "node:http";

export const app = express();

app.disable("x-powered-by");
if (config.trustProxy) app.set("trust proxy", 1);
app.use(
    helmet({
        // The dashboard is currently served as a static page with inline
        // scripts; CSP will be added alongside a nonce-based template pass.
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: false,
    })
);

app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
});

app.get("/readyz", async (_req, res) => {
    try {
        await checkDatabaseConnection();
        res.json({ status: "ready" });
    } catch {
        res.status(503).json({ status: "unavailable" });
    }
});

const apiRateLimit = rateLimit({
    windowMs: config.rateLimitWindowMinutes * 60 * 1000,
    limit: config.rateLimitMaxRequests,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests; please try again later." },
});
const authRateLimit = rateLimit({
    windowMs: config.rateLimitWindowMinutes * 60 * 1000,
    limit: config.authRateLimitMaxRequests,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many authentication requests; please try again later." },
});

const PgSession = connectPgSimple(session);

app.use(express.json());
app.use(
    session({
        store: new PgSession({ pool, tableName: "session" }),
        secret: config.sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24 * 7,
            httpOnly: true,
            secure: config.baseUrl.startsWith("https://"),
            sameSite: "lax",
        },
    })
);
app.use(csrfProtection);
app.use(passport.initialize());
app.use(passport.session());

app.use("/auth", authRateLimit);
app.use("/api", apiRateLimit);
app.use("/auth", authRouter);
app.use("/api/steam", steamRouter);
app.use("/api/xbox", xboxRouter);
app.use("/api/psn", psnRouter);
app.use("/api/retro", retroRouter);
app.use("/api/gog", gogRouter);
app.use("/api/me", scoreRouter);
app.use("/api/me", gamesRouter);
app.use("/api/matching", matchingRouter);
app.use("/api/public", publicRouter);

// Serves the same static SPA shell as the dashboard - profile.html reads the
// slug from the URL client-side and hits /api/public/:slug itself. No auth
// here since a public profile is meant to be viewable without an account.
app.get("/u/:slug", (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "profile.html"));
});

app.get("/leaderboard", (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "leaderboard.html"));
});

// Same no-auth, slug-driven pattern as /u/:slug above - both profiles being
// compared must independently be is_public (enforced by /api/public/:slug
// itself), no separate access model introduced here.
app.get("/compare", (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "compare.html"));
});

app.use(express.static(path.join(__dirname, "..", "public")));

// Every route above hands failures to next(err); without this, Express's
// default handler sends an HTML error page, which breaks every fetch()-based
// call in the dashboard (JSON.parse on "<!DOCTYPE ...").
const jsonErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
};
app.use(jsonErrorHandler);

export async function shutdownServer(server: Server): Promise<void> {
    const forceCloseTimer = setTimeout(() => server.closeAllConnections(), 10_000);
    forceCloseTimer.unref();
    try {
        await new Promise<void>((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
        });
        await pool.end();
    } finally {
        clearTimeout(forceCloseTimer);
    }
}

export function startServer(): Server {
    const server = app.listen(config.port, () => {
        console.log(`Unified Achievement Manager server listening on ${config.baseUrl}`);
    });

    const stopScheduler = config.schedulerEnabled ? startScheduler(config.schedulerIntervalMinutes) : () => undefined;

    let shutdownPromise: Promise<void> | undefined;
    const shutdown = (signal: string) => {
        if (!shutdownPromise) {
            console.log(`Received ${signal}; draining HTTP connections and closing the database pool.`);
            stopScheduler();
            shutdownPromise = shutdownServer(server).catch((err) => {
                console.error("Graceful shutdown failed:", err);
                process.exitCode = 1;
            });
        }
        return shutdownPromise;
    };
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
    process.once("SIGINT", () => void shutdown("SIGINT"));

    return server;
}

if (require.main === module) startServer();
