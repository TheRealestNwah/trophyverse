import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { getGamesForUser, getAchievementsForGame, getRecentActivity, getFunStats, getFullExportData } from "./queries";
import { recomputeUserScore } from "../scoring";
import { uploadCoverImage, uploadIconImage, publicUploadUrl, deleteIfUploaded } from "./uploads";
import { deleteUserAccount } from "../auth/accountDeletion";

export const gamesRouter = Router();

function destroyCurrentSession(req: import("express").Request): Promise<void> {
    return new Promise((resolve, reject) => {
        req.logout((logoutError) => {
            if (logoutError) return reject(logoutError);
            req.session.destroy((sessionError) => (sessionError ? reject(sessionError) : resolve()));
        });
    });
}

gamesRouter.delete("/account", requireAuth, async (req, res, next) => {
    try {
        if (req.body?.confirmation !== "DELETE") {
            return res.status(400).json({ error: 'Type "DELETE" to permanently delete your account.' });
        }

        const result = await deleteUserAccount(req.user!.id);
        await destroyCurrentSession(req);
        res.clearCookie("connect.sid");
        if (result.fileCleanupPending) {
            return res.status(202).json({ message: "Account deleted; uploaded-file cleanup is pending." });
        }
        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

gamesRouter.get("/accounts", requireAuth, async (req, res, next) => {
    try {
        const result = await pool.query(
            "select platform_id, display_name, linked_at, last_synced_at from user_platform_accounts where user_id = $1 order by platform_id",
            [req.user!.id]
        );
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// Steam can't be disconnected here - it's the sign-in identity, not just a
// linked data source, so there's no account left to be signed in as
// afterward. Deleting the user_platform_accounts row cascades to that
// account's own user_owned_games/user_achievement_unlocks (see
// db/schema.sql's ON DELETE CASCADE) without touching the shared canonical
// games/achievements tables other users or platforms still reference.
gamesRouter.delete("/accounts/:platformId", requireAuth, async (req, res, next) => {
    try {
        const { platformId } = req.params;
        if (platformId === "steam") {
            return res.status(400).json({ error: "Steam can't be disconnected - it's how you sign in." });
        }

        const result = await pool.query(
            "delete from user_platform_accounts where user_id = $1 and platform_id = $2 returning id",
            [req.user!.id, platformId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "No linked account for that platform" });
        }

        const score = await recomputeUserScore(req.user!.id);
        res.json({ score });
    } catch (err) {
        next(err);
    }
});

gamesRouter.get("/games", requireAuth, async (req, res, next) => {
    try {
        res.json(await getGamesForUser(req.user!.id));
    } catch (err) {
        next(err);
    }
});

gamesRouter.get("/activity", requireAuth, async (req, res, next) => {
    try {
        res.json(await getRecentActivity(req.user!.id));
    } catch (err) {
        next(err);
    }
});

gamesRouter.get("/stats", requireAuth, async (req, res, next) => {
    try {
        res.json(await getFunStats(req.user!.id));
    } catch (err) {
        next(err);
    }
});

function toCsv(rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return "";
    const headers = Object.keys(rows[0]);
    const escape = (value: unknown) => {
        const str = value === null || value === undefined ? "" : String(value);
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    return [headers.join(","), ...rows.map((row) => headers.map((h) => escape(row[h])).join(","))].join("\n");
}

// Scoped to the requesting user's own data only - req.user!.id, no way to
// pass a different user, no admin/global export (see #26).
gamesRouter.get("/export", requireAuth, async (req, res, next) => {
    try {
        const rows = await getFullExportData(req.user!.id);
        const wantsCsv =
            req.query.format === "csv" || (!req.query.format && (req.headers.accept ?? "").includes("text/csv"));

        if (wantsCsv) {
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", 'attachment; filename="unified-achievement-manager-export.csv"');
            res.send(toCsv(rows));
        } else {
            res.setHeader("Content-Disposition", 'attachment; filename="unified-achievement-manager-export.json"');
            res.json(rows);
        }
    } catch (err) {
        next(err);
    }
});

gamesRouter.get("/games/:gameId/achievements", requireAuth, async (req, res, next) => {
    try {
        const achievements = await getAchievementsForGame(req.user!.id, req.params.gameId);
        if (!achievements) {
            return res.status(404).json({ error: "Game not found in your library" });
        }
        res.json(achievements);
    } catch (err) {
        next(err);
    }
});

// Only checks that the URL is well-formed http(s) - deliberately doesn't
// fetch it server-side to validate content-type, which would let a pasted
// URL make the server issue requests to arbitrary (including internal)
// addresses. A bad/broken URL just fails to load client-side, same as any
// other image in this app (loading="lazy" + onerror removal).
function isHttpUrl(value: unknown): value is string {
    if (typeof value !== "string") return false;
    try {
        return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
        return false;
    }
}

// User-pasted cover art/icons (see #32) - scoped per-user (see
// db/schema.sql's user_game_cover_overrides/user_achievement_icon_overrides)
// since games/canonical_achievements are shared canonical rows across every
// user, not owned by any one of them.
async function userOwnsGame(userId: string, gameId: string): Promise<boolean> {
    const owns = await pool.query(
        `select 1 from user_owned_games uog
         join user_platform_accounts upa on upa.id = uog.user_platform_account_id
         where upa.user_id = $1 and uog.game_id = $2
         limit 1`,
        [userId, gameId]
    );
    return owns.rows.length > 0;
}

gamesRouter.put("/games/:gameId/cover", requireAuth, async (req, res, next) => {
    try {
        if (!isHttpUrl(req.body?.url)) {
            return res.status(400).json({ error: "url must be a valid http(s) URL" });
        }
        if (!(await userOwnsGame(req.user!.id, req.params.gameId))) {
            return res.status(404).json({ error: "Game not found in your library" });
        }

        // Read the old value before overwriting it - pasting a URL over a
        // previously uploaded file orphans that file on disk otherwise, the
        // same cleanup the dedicated DELETE/upload endpoints below do.
        const previous = await pool.query(
            "select cover_image_url from user_game_cover_overrides where user_id = $1 and game_id = $2",
            [req.user!.id, req.params.gameId]
        );
        await pool.query(
            `insert into user_game_cover_overrides (user_id, game_id, cover_image_url)
             values ($1, $2, $3)
             on conflict (user_id, game_id) do update set cover_image_url = excluded.cover_image_url`,
            [req.user!.id, req.params.gameId, req.body.url]
        );
        deleteIfUploaded(previous.rows[0]?.cover_image_url);
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

gamesRouter.post("/games/:gameId/cover/upload", requireAuth, (req, res, next) => {
    uploadCoverImage(req, res, async (err) => {
        try {
            if (err) return res.status(400).json({ error: err.message || "Upload failed" });
            if (!req.file) return res.status(400).json({ error: "file is required" });

            if (!(await userOwnsGame(req.user!.id, req.params.gameId))) {
                deleteIfUploaded(publicUploadUrl("covers", req.file));
                return res.status(404).json({ error: "Game not found in your library" });
            }

            const url = publicUploadUrl("covers", req.file);
            const previous = await pool.query(
                "select cover_image_url from user_game_cover_overrides where user_id = $1 and game_id = $2",
                [req.user!.id, req.params.gameId]
            );
            await pool.query(
                `insert into user_game_cover_overrides (user_id, game_id, cover_image_url)
                 values ($1, $2, $3)
                 on conflict (user_id, game_id) do update set cover_image_url = excluded.cover_image_url`,
                [req.user!.id, req.params.gameId, url]
            );
            deleteIfUploaded(previous.rows[0]?.cover_image_url);
            res.json({ ok: true, url });
        } catch (e) {
            next(e);
        }
    });
});

gamesRouter.delete("/games/:gameId/cover", requireAuth, async (req, res, next) => {
    try {
        const result = await pool.query(
            "delete from user_game_cover_overrides where user_id = $1 and game_id = $2 returning cover_image_url",
            [req.user!.id, req.params.gameId]
        );
        deleteIfUploaded(result.rows[0]?.cover_image_url);
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

async function userOwnsAchievement(userId: string, achievementId: string): Promise<boolean> {
    const owns = await pool.query(
        `select 1 from canonical_achievements ca
         join user_owned_games uog on uog.game_id = ca.game_id
         join user_platform_accounts upa on upa.id = uog.user_platform_account_id
         where upa.user_id = $1 and ca.id = $2
         limit 1`,
        [userId, achievementId]
    );
    return owns.rows.length > 0;
}

gamesRouter.put("/achievements/:achievementId/icon", requireAuth, async (req, res, next) => {
    try {
        if (!isHttpUrl(req.body?.url)) {
            return res.status(400).json({ error: "url must be a valid http(s) URL" });
        }
        if (!(await userOwnsAchievement(req.user!.id, req.params.achievementId))) {
            return res.status(404).json({ error: "Achievement not found in your library" });
        }

        const previous = await pool.query(
            "select icon_url from user_achievement_icon_overrides where user_id = $1 and canonical_achievement_id = $2",
            [req.user!.id, req.params.achievementId]
        );
        await pool.query(
            `insert into user_achievement_icon_overrides (user_id, canonical_achievement_id, icon_url)
             values ($1, $2, $3)
             on conflict (user_id, canonical_achievement_id) do update set icon_url = excluded.icon_url`,
            [req.user!.id, req.params.achievementId, req.body.url]
        );
        deleteIfUploaded(previous.rows[0]?.icon_url);
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

gamesRouter.post("/achievements/:achievementId/icon/upload", requireAuth, (req, res, next) => {
    uploadIconImage(req, res, async (err) => {
        try {
            if (err) return res.status(400).json({ error: err.message || "Upload failed" });
            if (!req.file) return res.status(400).json({ error: "file is required" });

            if (!(await userOwnsAchievement(req.user!.id, req.params.achievementId))) {
                deleteIfUploaded(publicUploadUrl("icons", req.file));
                return res.status(404).json({ error: "Achievement not found in your library" });
            }

            const url = publicUploadUrl("icons", req.file);
            const previous = await pool.query(
                "select icon_url from user_achievement_icon_overrides where user_id = $1 and canonical_achievement_id = $2",
                [req.user!.id, req.params.achievementId]
            );
            await pool.query(
                `insert into user_achievement_icon_overrides (user_id, canonical_achievement_id, icon_url)
                 values ($1, $2, $3)
                 on conflict (user_id, canonical_achievement_id) do update set icon_url = excluded.icon_url`,
                [req.user!.id, req.params.achievementId, url]
            );
            deleteIfUploaded(previous.rows[0]?.icon_url);
            res.json({ ok: true, url });
        } catch (e) {
            next(e);
        }
    });
});

gamesRouter.delete("/achievements/:achievementId/icon", requireAuth, async (req, res, next) => {
    try {
        const result = await pool.query(
            "delete from user_achievement_icon_overrides where user_id = $1 and canonical_achievement_id = $2 returning icon_url",
            [req.user!.id, req.params.achievementId]
        );
        deleteIfUploaded(result.rows[0]?.icon_url);
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});
