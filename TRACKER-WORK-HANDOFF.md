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

Current target version was bumped from **2.9.29** to **2.9.30**.

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

## IMPORTANT unfinished checks / likely issue

### 1. Fix Tracker client initialization race
`public/tracker.js` currently does this in `bind()`:

- waits for tab/panel to exist
- if the Tracker tab is still `.hidden`, it clears the panel and **returns**

Because `tracker.js` is a deferred script and the async auth/access check may still be running, this can cause the tracker client to stop binding before `syncTrackerTabAccess()` reveals the tab.

**Fix:** if the tab is hidden, retry `bind()` after ~250 ms instead of permanently returning, or dispatch an access-ready event from app.js.

### 2. Verify exact corporation
Set Railway:
`TRACKER_CORPORATION_ID=<exact corp ID>`

Do not rely permanently on `MARKET_CHARACTER_NAME` fallback unless that is intentional.

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

