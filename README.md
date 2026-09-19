# JLR Miner Tracker v2.2 — Website Build

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
- An active Red timer cannot be restarted or changed. The field becomes Green when the ten hours end.
- Signed-in players can add timestamped notes to each system while its current field cycle is active.
- Cherry Picked remains visible through Green / Yellow / Red changes.
- When a Red timer reaches zero, the field automatically returns to Green and clears 🍒 and all notes for that system.
- All signed-in browsers share the same board and receive changes live.

## Compact / Expanded UI

Compact mode keeps the mini-map, T3 field tiles, hit order, quick status update, projected m³/hr, projected ISK/hr, and API Actuals visible with minimal screen space.

Expanded mode uses the same data but adds larger controls, #1–#6 ore economics, active timers, connected-toon management, ESI sync controls, more detailed Actual-vs-Projected information, and the **Mining Output Calculator**. The calculator can select a linked miner, read that character's mining skills, show saved mining fittings, select a Porpoise or Rorqual booster, and estimate skill-adjusted and boosted m³/hr.

## ESI Actuals and privacy

JLR requests these ESI scopes:

- `esi-industry.read_character_mining.v1` — fleet mining Actuals
- `esi-skills.read_skills.v1` — the linked character's mining and command skill levels
- `esi-fittings.read_fittings.v1` — the linked character's saved mining fittings
- `esi-assets.read_assets.v1` — Abyssal mining-module details used by saved fits
- `esi-location.read_location.v1` — current solar system when that toon imports a Probe Scanner copy

Character location is requested only by the Probe Scanner import action. The current location is returned to that signed-in user for matching the scan to a tracked system; it is not persisted or broadcast to the fleet. Skills and saved fittings are shown only to the JLR account that linked that character.

Characters authorized before v2.2 need to use **Authorize** once so EVE can grant the two new read-only scopes.

During an ESI sync, the server temporarily reads the mining ledger's system and ore IDs so it can calculate m³ and apply the supplied T3 workbook value. The persisted mining history is then reduced to **fleet totals by date**. It does not persist which pilot mined in which system.

Actuals on the dashboard come from EVE mining-ledger API data. Projected values come from the user's local fleet calculator.

### Probe Scanner import

1. Select all rows in EVE's Probe Scanner and copy them.
2. Choose the linked toon in JLR and press **Paste Scan**.
3. JLR reads that toon's current solar system through ESI and looks for the expected T3 deposit in the copied rows.
4. A detected deposit marks the tracked field green. A missing deposit always requires confirmation before JLR marks it red and starts the fixed 10-hour timer.

Clipboard access requires a user click. If the browser blocks direct clipboard reading, JLR opens a paste box instead. JLR does not control the EVE client, scrape its cache, or store copied scanner rows.

### ESI refresh scheduling

- Mining ledgers refresh on a rolling 15-minute cycle.
- Character refresh starts are staggered across most of that window instead of being sent as one burst.
- Skills, fittings, and assets refresh at most every six hours during automatic syncs because they change far less often than the mining ledger.
- **Sync EVE Data** refreshes only the signed-in user's linked toons and forces their skills, fittings, and assets to update.
- Duplicate refreshes for the same user or character share the in-progress request instead of consuming ESI calls twice.
- ESI `429` responses honor `Retry-After`; temporary gateway failures use bounded exponential backoff.
- Shared type, system, and Dogma lookups are cached and concurrent duplicate lookups are collapsed.

ESI's authenticated rate-limit buckets are assigned per application-and-character pair. The scheduler still keeps total server traffic smooth so a large linked fleet does not create a synchronized burst.

### Skill / fitting / boost calculator

The v2.2 expanded view adds a calculator that mirrors the supplied workbook's **Yield Calc** sheet:

- reads Mining, Astrogeology, Mining Barge, Exhumers, Mining Exploitation, Mining Precision, Mining Director, Industrial Command Ships, and Capital Industrial Ships levels from ESI
- lists saved mining fits for barges/exhumers and saved Porpoise, Orca, or Rorqual boost fits
- reads supported strip miners, Mining Laser Upgrades, and Mining Survey Chipsets from the saved fit
- reads the booster hull, Industrial Core I/II, and Mining Foreman Burst I/II from the saved boost fit
- allows crystal, Mining Foreman Mindlink, and Mining Laser Efficiency Charge to be selected when they are not reliably represented in a saved fit
- applies the same base-yield, critical-success, duration, Mining Laser Optimization, and Mining Laser Efficiency formulas used by the original workbook
- shows per-ship and fleet m³/hr

The lookup values in `source-data.json` are copied from the workbook's Yield Calc tables. A regression test reproduces the workbook's selected Mackinaw result of **405,704.7772 m³/hr** and its **61.5234375%** Rorqual optimization value. This is intentionally workbook-faithful rather than a separate guessed fitting model.

## Public website setup

The server should be hosted behind HTTPS with persistent storage for the `/data` directory. Players then visit the public URL in a normal browser.

### 1. Register the EVE application

Create a **web/server-side** application in the EVE Developers portal.

Register this exact callback URL:

`https://YOUR-DOMAIN/auth/eve/callback`

Add these scopes:

```text
esi-industry.read_character_mining.v1
esi-skills.read_skills.v1
esi-fittings.read_fittings.v1
```

Keep the EVE application Client Secret private. Do not put it in browser JavaScript or share it with users.

### 2. Configure the web host

Set these environment variables in the hosting provider's GUI/dashboard:

```text
PUBLIC_URL=https://YOUR-DOMAIN
EVE_CLIENT_ID=your-client-id
EVE_CLIENT_SECRET=your-client-secret
SESSION_SECRET=a-long-random-secret
TOKEN_ENCRYPTION_KEY=another-long-random-secret
ESI_USER_AGENT=JLR-Miner-Tracker/2.2 contact=your-contact
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

The bundled source data contains **15 T3 systems** from the supplied workbook and the six priority ore classes:

1. Kylixium
2. Ueganite
3. Griemeer
4. Nocxite
5. Hezorime
6. Mordunium

Default calculator baselines:

- Hulk + ORE Strip Miner: `406,800 m³/hr` per ship before Abyssal adjustment.
- Mackinaw + Modulated Strip Miner II: `405,704.7772 m³/hr` per ship before Abyssal adjustment.

The default payout display is 95% JBV, but each browser can change its own projection settings without changing the shared field board.

## Security notes

- EVE Client Secret remains server-side.
- Refresh tokens are encrypted at rest.
- Browser sessions are signed HttpOnly cookies.
- OAuth `state` is validated.
- JWT signatures, issuer, expiration, audience, client ID, and requested ESI scopes are checked before protected ESI data is used.
- POST/PUT/DELETE API requests are same-origin checked.
- Character location is read only during a user-requested Probe Scanner import and is not stored or shared.
- Linked toon names are visible only to the account that linked them.


## v2.1 hosting fix

Static  now lives outside , so a production volume can safely mount at  without hiding the bundled Fountain ore/system definitions.


## v2.2 skills, fittings, and boosts

v2.2 adds read-only ESI skill and saved-fitting sync plus a mining-output calculator driven by the original workbook's Yield Calc formulas and lookup tables. Existing linked characters keep working for mining Actuals, but the UI marks them **Authorize** until they grant the new skills/fittings scopes.

The uploaded workbook also reduced the T3 field list from the older 20-system set to the current 15-system set; the bundled source data now matches that workbook list.

## v2.3.45 Probe Scanner import

Linked toons can grant read-only location access for one-click Probe Scanner imports. Existing toons must use **Update Access** once before their first import.
