# Production operations

## Deploy and readiness

1. Keep `SESSION_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` stable across deploys. Store both in the deployment secret manager, not in the repository or an image.
2. Run `npm run db:migrate` from `server` before starting a new application version. The schema operation and level-threshold seed are safe to rerun.
3. Start the server with `npm start` and wait for `GET /readyz` to return HTTP 200 before routing traffic. `GET /healthz` is a liveness check and does not require the database.
4. On deploy or termination, send SIGTERM and allow the process to drain. The server stops accepting new connections, closes the database pool, and exits with a failure code if shutdown cannot complete.

The command-line database check is also available as `npm run db:health` for diagnostics.

## Backups and recovery

Use PostgreSQL's native tools against the same `DATABASE_URL` used by the server:

```bash
pg_dump --format=custom --file=trophyverse-$(date +%Y%m%d-%H%M%S).dump "$DATABASE_URL"
pg_restore --clean --if-exists --dbname="$DATABASE_URL" trophyverse-backup.dump
```

Take a backup before schema or data migrations and retain encrypted, access-controlled copies according to the deployment's retention policy. After restoring, run `npm run db:migrate`, then verify `/readyz` and `npm run db:health` before enabling traffic. If the credential-encryption key is lost, encrypted platform credentials cannot be recovered; preserve that key separately from database backups.
