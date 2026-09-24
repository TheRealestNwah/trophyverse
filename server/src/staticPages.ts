import { readFileSync } from "node:fs";
import path from "node:path";
import { Request, Response } from "express";

// The dashboard's HTML files use inline <script>/<style> blocks (no src/href).
// CSP requires each one tagged with the per-request nonce; external
// <script src="..."> tags are covered by script-src 'self' and left alone.
const INLINE_SCRIPT_OR_STYLE_OPEN_TAG = /<(script|style)(?![^>]*\b(?:src|href)=)([^>]*)>/gi;

const publicDir = path.join(__dirname, "..", "public");
const pageCache = new Map<string, string>();

function readPage(fileName: string): string {
    let html = pageCache.get(fileName);
    if (html === undefined) {
        html = readFileSync(path.join(publicDir, fileName), "utf8");
        pageCache.set(fileName, html);
    }
    return html;
}

export function sendPageWithNonce(fileName: string, _req: Request, res: Response): void {
    const html = readPage(fileName).replace(
        INLINE_SCRIPT_OR_STYLE_OPEN_TAG,
        (_match, tag: string, rest: string) => `<${tag}${rest} nonce="${res.locals.cspNonce}">`
    );
    res.type("html").send(html);
}
