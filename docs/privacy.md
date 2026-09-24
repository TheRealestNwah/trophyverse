# Privacy and data handling

This document describes the data the Unified Achievement Manager stores and how an operator should communicate that handling to users. It is product documentation, not legal advice; deployments must adapt it to their jurisdiction, hosting model, and contact details.

## What is stored

- **Sign-in identity:** the Steam account identifier and display name returned by Steam OpenID and the app's generated user ID.
- **Linked-platform data:** platform account IDs, display names, owned games, achievement definitions, unlock timestamps, and derived score/level data for each linked account.
- **Platform credentials:** PSN/GOG access and refresh tokens, Xbox/OpenXBL keys, and RetroAchievements keys are encrypted at rest with the deployment's AES-256-GCM `CREDENTIAL_ENCRYPTION_KEY`. They are decrypted only in application memory when a sync or catalog lookup needs them. The key is never stored in PostgreSQL.
- **Sessions:** signed session records are stored in PostgreSQL so a restart does not silently log users out. The session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` on HTTPS deployments.
- **Optional user content:** cover-art and achievement-icon overrides a user adds.

## How data is used

The service uses linked credentials only to request library and achievement data from the platform the user selected. It uses that data to build the private dashboard, calculate scores, and match equivalent games/achievements. It does not need a user's platform password.

Requests to platform APIs are subject to those providers' terms and availability. Operators should link to the current Steam, Sony, OpenXBL, RetroAchievements, and GOG policies from their deployment's privacy notice rather than copying third-party terms here.

## Sharing and visibility

Private libraries are available only to the signed-in user and server operators with database access.

The application does not include advertising, analytics, or a data sale feature. Operators must document any hosting logs, monitoring, backups, or additional integrations they add around this repository.

## Retention and deletion

Disconnecting Xbox, PSN, RetroAchievements, or GOG removes that linked account and its per-user ownership/unlock rows through the database cascade. Shared canonical game and achievement rows may remain because they can be used by other users. Steam is the sign-in identity and cannot be disconnected through the dashboard.

Users can permanently delete their own signed-in account from the dashboard after typing `DELETE` to confirm. The service revokes sessions, deletes the user row and its cascaded linked accounts, ownership, unlocks, scores, and private overrides, then removes app-owned uploaded images. Shared canonical game and achievement rows may remain because other users can reference them. Operators must still publish a contact path for backup, external-log, or legal deletion requests.

## Operator responsibilities

Keep `SESSION_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` in a secret manager, restrict database and backup access, rotate/revoke platform credentials when a user disconnects or suspects compromise, and never put tokens in logs or support tickets. Follow [the operations runbook](operations.md) for backups, restores, migrations, and readiness checks.
