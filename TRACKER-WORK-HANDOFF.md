# Heavy Fighter Tracker — Work Handoff

## Goal

Add a new **TRACKER** tab to JLR Miner Tracker that watches zKillboard for **Heavy Fighter losses** using the user's example feed:

- https://zkillboard.com/group/1653/losses/

When a new Heavy Fighter loss appears, users who have armed alerts should get:
- a loud obnoxious in-browser siren
- the solar system/location
- fighter type
- victim / corporation / alliance details when available
- final blow details when available
- attacker count
- zKill value
- direct zKillboard killmail link

The Tracker must be **restricted to the user's corporation only**.

## Repository

`JohnLuman/JLR-Miner-Tracker`

Current target version is now **2.9.31**.

## Work already pushed

### Server
`server.mjs`

Added:
- `HEAVY_FIGHTER_GROUP_ID = 1653`
- 30-second local tracker cache
- 24-hour Heavy Fighter loss window
- `heavyFighterTracker()`
- `GET /api/tracker/heavy-fighters`
- name enrichment through existing ESI universe-name helper
- cached/stale fallback if zKillboard temporarily fails

Tracker data contains:
- killmail ID/time
- fighter type
- system ID/name
- victim character/corp/alliance
- final blow character/corp/alliance/ship
- attacker count
- total value
- solo/NPC/awox flags
- zKill killmail URL

### Corporation access wall
`server.mjs`

Added:
- `TRACKER_CORPORATION_ID_ENV`
- `trackerCorporationIdentity()`
- `trackerAccessForUser()`
- tracker access result in `/api/me`
- API endpoint returns **403** unless a linked EVE character belongs to the configured corporation

Current corporation resolution logic:
1. If Railway/env has `TRACKER_CORPORATION_ID`, use that exact corp ID.
2. Otherwise it resolves the corporation of `MARKET_CHARACTER_NAME` (currently defaults to `John Leman Raholan`) and uses that corporation.

**Work should verify/set the exact desired corporation ID in Railway as `TRACKER_CORPORATION_ID`. This is preferable to relying on the fallback owner character.**

### Navigation/access UI
`public/index.html`
- Added a **TRACKER** tab after INIT PVP.
- Tab starts hidden.

`public/app.js`
- Added `tracker` as a tab panel.
- Added `trackerAllowed()` and `syncTrackerTabAccess()`.
- Tracker tab is only revealed if `me.trackerAccess.allowed === true`.
- Unauthorized users cannot switch into the tracker tab.

### Tracker client
New file:
`public/tracker.js`

Implements:
- tracker feed loading
- automatic polling
- local seen-kill tracking
- unread count on Tracker tab
- arm/disarm preference in localStorage
- loud WebAudio siren
- Test Siren button
- optional browser notification permission
- kill cards with location/details/link

### Styles
New file:
`public/tracker.css`

Contains the Tracker-specific red alert UI, feed cards, armed state, pulse effects, responsive layout.

`public/index.html` loads both:
- `/tracker.css?v=2.9.30`
- `/tracker.js?v=2.9.30`

### package.json
Version bumped to **2.9.30**.

## Commits already made

- `55018023360419fd157b7156f230b9885d6753e3` — Add Heavy Fighter tracker API
- `168e041b878143deeef7983badd141ffc2b812a5` — Add Tracker navigation tab
- `29b31b7b0367e94c6a0bae0129c343aebd1f2f76` — Bump version to 2.9.30
- `ba62889a7fe4cc315a6e5858993c7b182911314e` — Wire Tracker tab into dashboard
- `9fb88ce448d420e8b8dfa8473c52dcb02cc874de` — Add Heavy Fighter Tracker client
- `2a97b45288fde72a51810793d75579af1cc384ce` — Load Tracker client
- `c55447c2719effa8eef0a26b59074e770c499cd3` — Restrict tracker API to owner corporation
- `25eeaf2f3bef856b7b5fc7f6145bdb77decc359b` — Hide Tracker until corp access verified
- `e1d14432d4960e641b5a9f9a64d04e714e864c04` — Gate Tracker tab by corporation membership
- `a5a031be76bb03af25a1db042dca8eac80bddc49` — Respect corporation gate in Tracker client
- `8a19b21e5a8ae9caae215ca851e4a339d8fa03e7` — Style Heavy Fighter Tracker
- `92da874ad09ab71c25946571035524f2b4ce0c44` — Load Tracker styles

## R2Z2 live alert upgrade — v2.9.32

RedisQ was **not** used because zKillboard sunset RedisQ on May 31, 2026. Tracker now uses the supported **R2Z2** live sequence feed.

### Server live ingest
`server.mjs`

Added:
- one server-side R2Z2 consumer using `https://r2z2.zkillboard.com/ephemeral`
- sequence bootstrap from `sequence.json`
- sequential numbered killmail reads
- ~120 ms catch-up spacing (comfortably below zKillboard's 15 req/s limit)
- minimum 6-second wait at the live 404 edge
- stale-sequence reseeding
- retry/backoff handling
- Heavy Fighter type resolution from EVE universe group **1653**
- local filtering before doing name enrichment
- dedupe by killmail ID
- 24-hour in-memory live Heavy Fighter cache
- silent initial catch-up so a JLR restart does **not** alarm on existing kills
- live-status metadata included with the normal Tracker snapshot

### Authenticated browser push
New endpoint:
- `GET /api/tracker/heavy-fighters/stream`

Behavior:
- normal JLR session auth required
- TEMPLAR corporation gate required
- Server-Sent Events (SSE)
- `ready` event gives current R2Z2 status
- `status` event reports catch-up/errors
- `loss` event pushes a newly observed Heavy Fighter loss
- 20-second heartbeat keeps the stream alive through proxies

### Tracker client
`public/tracker.js`

Added:
- authenticated `EventSource` connection
- immediate processing of `loss` events
- live event dedupe against normal REST history polling
- immediate unread badge
- immediate loud siren/browser notification when armed
- live kill card insertion without waiting for the five-minute search API delay
- automatic reconnect behavior
- live UI states: CONNECTING / CATCHING UP / LIVE / RECONNECTING / SERVER LIVE
- REST history remains the fallback and fills the 24-hour list

The first REST history load still seeds silently. R2Z2 events received **after the server reaches the live edge** are the events that can trigger alarms.

### Version/cache
- app version: **2.9.32**
- frontend asset cache keys: **2.9.32**
- `npm test` already includes `node --check public/tracker.js`

### R2Z2 commits
- `d1aaa5514e9bd3c9bc8dc42f23f46c3cbbdd034d` — Add R2Z2 live Heavy Fighter ingest and SSE
- `f0761c13278a23c21f5b4bb73537c2c2229cd78e` — Fix R2Z2 tracker startup wiring
- `9712f2c2c7d1f4958b93b1e600daecb6e545dc69` — Fix Tracker SSE event framing
- `b408898c19dc06c8d10686442b3039dbba4f1e9c` — Connect Tracker client to R2Z2 live stream
- `4e96ad573d55cc5439b391472f20770e53611ea2` — Bump JLR to 2.9.32 for R2Z2 Tracker
- `0a7744d9e75327af50ac1c9cee0f8dcb18d04b78` — Refresh frontend cache version to 2.9.32

## Current status / remaining checks

### 1. Tracker client initialization race — FIXED
`public/tracker.js` now retries binding every ~250 ms while the corporation-gated Tracker tab is still hidden, so async `/api/me` access verification can finish before Tracker initializes.

Fixed in commit `0ab607ed171f6f9a3c3b934c6a9f4994a2455cba`.

### 2. Exact corporation — PINNED
Default Tracker corporation is now pinned in code to **TEMPLAR. [TMP.]** corporation ID **1831383486**. Railway can still override it with `TRACKER_CORPORATION_ID` if needed.

Pinned in commit `84b400945b544f29324614b8ab01023bb0abba1d`.

### 3. Validate zKill endpoint response
Confirm:
`https://zkillboard.com/api/losses/groupID/1653/pastSeconds/86400/`

returns the expected Heavy Fighter loss rows in production.

The regular zKill search API intentionally delays very recent killmails, so the UI currently explains that alerts may be about ~5 minutes behind the actual in-game loss.

### 4. Run syntax/tests
Run:
`npm test`

At minimum verify:
- `node --check public/tracker.js`
- `node --check public/app.js`
- `node --check server.mjs`

### 5. Test authorization
Test three cases:
- linked toon in target corporation → Tracker tab visible, endpoint 200
- logged-in user outside corp → Tracker tab hidden, endpoint 403
- not logged in → endpoint blocked by normal auth

### 6. Test alert behavior
- Open Tracker
- Arm loud alerts
- Test Siren
- leave Tracker tab and ensure background polling continues while the JLR page remains open
- simulate/new loss and confirm unread badge + siren + browser notification
- ensure existing losses at first load do NOT trigger a siren

## Desired final behavior

The feature should feel like an operations alarm:
- **TRACKER** tab after INIT PVP
- corp-members-only
- visually obvious armed/off state
- loud siren when a new Heavy Fighter loss becomes visible from zKill
- exact system and fighter information immediately readable
- direct killmail link
- no repeated alarms for the same killmail
- continues checking while user is elsewhere in JLR, as long as the page is open

