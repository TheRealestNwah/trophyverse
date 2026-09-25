import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import multer from "multer";
import { config } from "../config";

// Served at /uploads by index.ts. Lives in the desktop app's data folder when
// packaged, since the installed app bundle is read-only.
const UPLOADS_ROOT = config.uploadsDir;

const ALLOWED_MIME_TYPES: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
};

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function isAllowedImageType(mimeType: string): boolean {
    return Object.prototype.hasOwnProperty.call(ALLOWED_MIME_TYPES, mimeType);
}

// For images the server fetched itself (not a multipart upload). Same folder
// and naming as multer's uploads, so replace/delete cleanup treats it the same.
export async function saveImageBuffer(subdir: "covers" | "icons", buffer: Buffer, mimeType: string): Promise<string> {
    const dir = path.join(UPLOADS_ROOT, subdir);
    await fs.promises.mkdir(dir, { recursive: true });
    const filename = `${randomUUID()}.${ALLOWED_MIME_TYPES[mimeType]}`;
    await fs.promises.writeFile(path.join(dir, filename), buffer);
    return `/uploads/${subdir}/${filename}`;
}

function storageFor(subdir: "covers" | "icons") {
    const dir = path.join(UPLOADS_ROOT, subdir);
    fs.mkdirSync(dir, { recursive: true });
    return multer.diskStorage({
        destination: dir,
        // Random filename, not the client's original one - avoids both path
        // traversal from a crafted filename and collisions between users.
        filename: (_req, file, cb) => cb(null, `${randomUUID()}.${ALLOWED_MIME_TYPES[file.mimetype]}`),
    });
}

function fileFilter(_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) {
    if (!ALLOWED_MIME_TYPES[file.mimetype]) {
        return cb(new Error("Only JPEG, PNG, WebP, or GIF images are allowed"));
    }
    cb(null, true);
}

export const uploadCoverImage = multer({ storage: storageFor("covers"), fileFilter, limits: { fileSize: MAX_UPLOAD_BYTES } }).single(
    "file"
);
export const uploadIconImage = multer({ storage: storageFor("icons"), fileFilter, limits: { fileSize: MAX_UPLOAD_BYTES } }).single(
    "file"
);

// The public URL an uploaded file is reachable at, given multer's saved file.
export function publicUploadUrl(subdir: "covers" | "icons", file: Express.Multer.File): string {
    return `/uploads/${subdir}/${file.filename}`;
}

function uploadedFilePath(url: string | null | undefined): string | undefined {
    if (!url || !url.startsWith("/uploads/")) return undefined;
    const resolved = path.resolve(UPLOADS_ROOT, `.${url.slice("/uploads".length)}`);
    const uploadsRoot = `${path.resolve(UPLOADS_ROOT)}${path.sep}`;
    return resolved.startsWith(uploadsRoot) ? resolved : undefined;
}

export async function deleteUploadedFiles(urls: Array<string | null | undefined>): Promise<void> {
    for (const filePath of new Set(urls.map(uploadedFilePath).filter((value): value is string => Boolean(value)))) {
        try {
            await fs.promises.unlink(filePath);
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        }
    }
}

// Deletes a previously uploaded file when its override is replaced or
// removed - without this every re-upload or reversion to auto-detected art
// would leave the old file on disk forever. Only touches files this app
// actually wrote (under /uploads/); a user-pasted external URL has nothing
// local to delete, so this is a no-op for those.
export function deleteIfUploaded(url: string | null | undefined): void {
    const filePath = uploadedFilePath(url);
    if (!filePath) return;
    void fs.promises.unlink(filePath).catch(() => undefined);
}
