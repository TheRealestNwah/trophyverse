# 1.0 release checklist

Use this checklist for a production release. A green CI run is required, but it does not replace the live checks below. Do not create or push a release tag until the release owner explicitly approves it.

## Before the release candidate

- [ ] Confirm the issue and one-PR-per-item scope is complete; every PR is linked to an issue and carries the repository's established label.
- [ ] Confirm the default branch is clean, current, and protected by the required CI workflow (`lint`, production TypeScript, test TypeScript, unit tests, and PostgreSQL integration tests).
- [ ] Run `npm ci`, `npm run lint`, `npm run build`, `npx tsc --noEmit -p tsconfig.test.json`, and `npm test` from `server` locally.
- [ ] Run `npm audit --omit=dev` and review any remaining advisory rather than blindly suppressing it.
- [ ] Verify the deployment has stable `SESSION_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` values in its secret manager. Never generate a new encryption key during a routine deploy.
- [ ] For an existing database, take a PostgreSQL backup and run `npm run db:migrate`, then `npm run db:encrypt-platform-credentials` if plaintext credential rows predate the encryption rollout.

## Production smoke test

- [ ] Start the candidate and verify `/healthz` returns 200 without a database connection requirement.
- [ ] Verify `/readyz` and `npm run db:health` return success before routing traffic.
- [ ] Sign in with Steam and confirm the session survives a process restart.
- [ ] Link one test account on each enabled platform, sync it twice, and confirm the second sync does not duplicate games, achievements, ownership, or unlock rows.
- [ ] Exercise disconnect/reconnect and self-service account deletion; confirm private data is no longer returned and uploaded overrides are removed.
- [ ] Confirm state-changing dashboard requests succeed with the CSRF token and fail without it; confirm session cookies have the expected `HttpOnly`, `SameSite`, and HTTPS `Secure` attributes.
- [ ] Confirm public profiles and the leaderboard remain opt-in, and that turning a profile off removes it from public routes.
- [ ] Confirm rate-limit responses and security headers are present through the production proxy.

## Rollout and rollback

- [ ] Apply database changes before starting the new application version; keep the previous application version available until readiness and smoke checks pass.
- [ ] Send SIGTERM during a controlled restart and verify the process drains connections, stops the scheduler, and closes the database pool.
- [ ] If the release fails, stop routing traffic, restore the prior application version, and use the documented PostgreSQL restore procedure. Do not rotate the credential-encryption key as a rollback step.
- [ ] Record the deployed commit, migration status, backup identifier, and smoke-test result in the release notes.
- [ ] After explicit approval, create/push the release tag and publish the changelog. Branch cleanup happens only after the PR is merged.
