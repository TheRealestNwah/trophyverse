import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextFunction, Request, Response } from "express";

declare module "express-session" {
    interface SessionData {
        csrfToken?: string;
    }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function getCsrfToken(req: Request): string {
    if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString("hex");
    return req.session.csrfToken;
}

export function csrfTokensMatch(expected: string | undefined, provided: string | undefined): boolean {
    if (!expected || !provided) return false;
    const expectedBytes = Buffer.from(expected, "utf8");
    const providedBytes = Buffer.from(provided, "utf8");
    return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(req.method)) return next();
    if (!csrfTokensMatch(req.session.csrfToken, req.get("x-csrf-token"))) {
        res.status(403).json({ error: "Invalid CSRF token" });
        return;
    }
    next();
}
