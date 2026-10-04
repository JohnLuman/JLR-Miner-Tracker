# Owner alarm diagnostic

Open Tracker as the JLR owner and click SIMULATE LOSS. The diagnostic unlocks browser audio during the click, waits up to four seconds for this tab's SSE connection, calls the existing owner-guarded simulation endpoint, and waits up to ten seconds for the matching simulation run. No real loss or production database record is created by this diagnostic.

Stage meanings:

- ownerRequest: this authenticated request was accepted by the existing owner-guarded route. It does not prove denial for every other account.
- stream: this browser observed its EventSource open.
- serverSend: the server reported writing the simulation to at least one account-scoped stream. This alone does not prove browser receipt.
- browserReceipt: this tab observed a simulated loss with the exact run ID returned by the server.
- freshness: that loss passed the existing freshness and non-INIT filters.
- overlay and audio: the existing alarm runtime hook reported the same run's visible overlay and active playback. A different tab can own the audio lease; these are observations of this tab only.
- heardSound: click I HEARD SOUND or NO SOUND. Technical playback cannot establish audible sound.
- silence: use STOP ALARM or the overlay's ACKNOWLEDGE / STOP and confirm the matching alarm is inactive and hidden.

PASS requires all stages to be ok. An explicit failure produces FAIL; pending/unknown stages produce INCOMPLETE. These results describe one simulation on this tab, not comprehensive security or live-loss coverage. Other runs cannot satisfy receipt. No stream means no simulation request is sent.

EXPORT DIAGNOSTIC LOG downloads a bounded JSON allowlist: schema, start time, validated simulation ID, stage states and result. It excludes account IDs, cookies, tokens, URLs, raw errors, killmail contents and browser/device identifiers. Share this file for investigation. The report stays in memory until export and is reset by the next run or page reload.

The diagnostic preserves the existing server owner check and account-scoped SSE delivery. Tests exercise run correlation (including SSE before the HTTP response), stale events, stream timeout, the client owner gate, completeness and export allowlisting with mocked browser/HTTP boundaries. They do not prove physical sound, production browser behavior or server-side authorization isolation.
