# JLR Miner Tracker v2.1 — Website Build

This version is designed to work like a normal EVE web app:

1. A player visits the public JLR website.
2. They click **Log in with EVE Online**.
3. EVE SSO handles the account login and character selection.
4. They arrive at the JLR dashboard — no command prompt, token copy/paste, or local setup for the player.
5. They can click **+ Add Toon** and authorize more mining characters once through EVE SSO.
6. JLR stores the mining refresh token encrypted on the server and refreshes it automatically.

## What changed from v1

- Website-first EVE SSO login page.
- Users have a signed web session after EVE login.
- Any signed-in user can update Green / Yellow / Red field status.
- Field updates remain anonymous on the board; JLR does not show where a player is.
- Each user sees only **their own linked toon names**. Other users see only the fleet-wide linked-character count and fleet Actual totals.
- **Add Toon** is a GUI button that sends the user through EVE SSO again.
- No player needs Node.js or a terminal. Only the hosted server runs Node.
- A hidden Windows launcher (`start-hidden.vbs`) is included for local testing without an open command window.

## Shared field behavior

- **Green** = site is up / untouched.
- **Yellow** = picked at / in progress.
- **🍒 Cherry Picked** is a separate persistent report flag.
- **Red** = cleared. Starting Red requires confirmation and starts a 10-hour timer.
- Cherry Picked remains visible through Green / Yellow / Red changes.
- When a Red timer reaches zero, the field automatically returns to Green, its note clears, and 🍒 clears.
- All signed-in browsers share the same board and receive changes live.

## Compact / Expanded UI

Compact mode keeps the mini-map, T3 field tiles, hit order, quick status update, projected m³/hr, projected ISK/hr, and API Actuals visible with minimal screen space.

Expanded mode uses the same data but adds larger controls, #1–#6 ore economics, active timers, connected-toon management, ESI sync controls, and more detailed Actual-vs-Projected information.

## ESI Actuals and privacy

JLR requests only:

`esi-industry.read_character_mining.v1`

It does **not** request a character-location scope.

During an ESI sync, the server temporarily reads the mining ledger's system and ore IDs so it can calculate m³ and apply the supplied T3 workbook value. The persisted mining history is then reduced to **fleet totals by date**. It does not persist which pilot mined in which system.

Actuals on the dashboard come from EVE mining-ledger API data. Projected values come from the user's local fleet calculator.

## Public website setup

The server should be hosted behind HTTPS with persistent storage for the `/data` directory. Players then visit the public URL in a normal browser.

### 1. Register the EVE application

Create a **web/server-side** application in the EVE Developers portal.

Register this exact callback URL:

`https://YOUR-DOMAIN/auth/eve/callback`

Add this scope:

`esi-industry.read_character_mining.v1`

Keep the EVE application Client Secret private. Do not put it in browser JavaScript or share it with users.

### 2. Configure the web host

Set these environment variables in the hosting provider's GUI/dashboard:

```text
PUBLIC_URL=https://YOUR-DOMAIN
EVE_CLIENT_ID=your-client-id
EVE_CLIENT_SECRET=your-client-secret
SESSION_SECRET=a-long-random-secret
TOKEN_ENCRYPTION_KEY=another-long-random-secret
ESI_USER_AGENT=JLR-Miner-Tracker/2.1 contact=your-contact
PORT=3187
```

If `PUBLIC_URL` is omitted, JLR can infer it from normal reverse-proxy headers, but an explicit HTTPS URL is safer for production.

### 3. Persist `/data`

The host needs persistent storage for the app's `/data` directory. That directory contains:

- shared field states and timers
- users / linked-character ownership
- encrypted EVE refresh tokens
- aggregated fleet Actual totals
- local token-encryption key when a fixed environment key was not supplied

Do not use ephemeral-only storage for a real deployment.

## Docker

A `Dockerfile` is included. Any provider that can run a Node/Docker web service with HTTPS and a persistent volume can host JLR.

The container listens on `PORT` and starts with:

`node server.mjs`

## Local GUI test

For local testing only:

1. Install Node.js 22+.
2. Copy `.env.example` to `.env` and add EVE credentials if testing SSO locally.
3. Double-click `start-hidden.vbs`.

It starts the server hidden and opens the browser, so there is no persistent command-prompt window.

A local callback is typically:

`http://localhost:3187/auth/eve/callback`

For the real shared app, use the public HTTPS callback instead.

## Fountain data in this build

The bundled source data contains **20 T3 systems** from the supplied workbook and the six priority ore classes:

1. Kylixium
2. Ueganite
3. Griemeer
4. Nocxite
5. Hezorime
6. Mordunium

Default calculator baselines:

- Hulk + ORE Strip Miner: `406,800 m³/hr` per ship before Abyssal adjustment.
- Mackinaw + Modulated Strip Miner II: `405,704.7771 m³/hr` per ship before Abyssal adjustment.

The default payout display is 95% JBV, but each browser can change its own projection settings without changing the shared field board.

## Security notes

- EVE Client Secret remains server-side.
- Refresh tokens are encrypted at rest.
- Browser sessions are signed HttpOnly cookies.
- OAuth `state` is validated.
- JWT signatures, issuer, expiration, audience, client ID, and mining scope are checked.
- POST/PUT/DELETE API requests are same-origin checked.
- Character-location permission is never requested.
- Linked toon names are visible only to the account that linked them.


## v2.1 hosting fix

Static  now lives outside , so a production volume can safely mount at  without hiding the bundled Fountain ore/system definitions.
