# Privacy and data handling

Unified Achievement Manager runs entirely on your computer. There's no Unified Achievement Manager server, account, analytics, telemetry, or advertising. This page describes what the app stores locally and which outside services it talks to. It's product documentation, not legal advice.

## What is stored, and where

Everything is kept in your Windows user's data folder, `%APPDATA%\Unified Achievement Manager` (see [operations.md](operations.md)):

- **Sign-in identity:** your Steam account ID and display name, returned by Steam's own sign-in page, and the app's generated user ID.
- **Library data:** for each linked platform, the account ID and display name, owned games, achievement definitions, unlock times, and the derived score and level.
- **Credentials:** your Steam Web API key, Xbox/OpenXBL key, PSN and GOG tokens, RetroAchievements key, and SteamGridDB key if you add one. These are encrypted with AES-256-GCM before they're written to the database. The encryption key is in `secrets.json` in the same folder. That keeps credentials unreadable in a copied database file on its own, but it doesn't protect them from someone who can already open your Windows account's files.
- **Sessions:** the app's sign-in session is stored in its database, so you stay signed in across restarts.
- **Your content:** cover art and achievement icons you add.
- **Logs:** app and database logs in the data folder. They aren't meant to contain credentials, but check them before sharing them with anyone.

The app's database and web server only accept connections from your own computer (`127.0.0.1`).

## What is sent where

The app only contacts:

- **The platforms you connect** (Steam, OpenXBL for Xbox, PlayStation Network, RetroAchievements, GOG), using the credentials you gave it, to read your library and achievements. Steam sign-in happens on Steam's own page. The app never sees your platform passwords.
- **Image hosts** for game covers and achievement icons, which are loaded from each platform's CDN or from image URLs you paste.

Those requests are subject to each provider's own terms and privacy policies. The app sends nothing anywhere else.

## Deleting data

- **Disconnect** removes that platform's linked account and its synced ownership and unlock data.
- **Delete account** removes your account, sessions, linked accounts, unlocks, scores, and overrides, and deletes uploaded images. App-wide settings stay: the Steam Web API key and, if you added one, the SteamGridDB key. Remove the SteamGridDB key from its settings row.
- **Uninstalling** removes the program but keeps the data folder. Delete `%APPDATA%\Unified Achievement Manager` to remove everything.
- Credentials you issued (API keys, tokens) can also be revoked on each platform's own site.
