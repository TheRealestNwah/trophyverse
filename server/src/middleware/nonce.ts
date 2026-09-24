import { randomBytes } from "node:crypto";
import { NextFunction, Request, Response } from "express";

declare module "express-serve-static-core" {
    interface Locals {
        cspNonce: string;
    }
}

export function nonceMiddleware(_req: Request, res: Response, next: NextFunction): void {
    res.locals.cspNonce = randomBytes(16).toString("base64");
    next();
}
