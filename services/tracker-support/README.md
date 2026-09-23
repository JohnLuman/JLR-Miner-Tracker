# JLR Tracker Support

Independent support service for Tracker chat context.

## What it does

- Gives every authenticated JLR user an isolated, opaque support session.
- Remembers short-lived conversational focus such as the last system Tracker recommended.
- Resolves contextual follow-ups such as "how far is it?" without mixing users.
- Persists sessions to a JSON file when a Railway volume is mounted.
- Requires a service-to-service bearer secret. Browsers never call this service directly.
- Can restart or be unavailable without taking the main JLR app down; the main app falls back to its existing Tracker logic.

## Railway deployment

Create a second Railway service from the same GitHub repository.

Set its root directory to:

```
/services/tracker-support
```

Required variable:

```
TRACKER_SUPPORT_SHARED_SECRET=<long random secret>
```

Recommended variables:

```
TRACKER_SUPPORT_STATE_FILE=/data/tracker-support-sessions.json
TRACKER_SUPPORT_SESSION_TTL_MS=43200000
TRACKER_SUPPORT_FOCUS_TTL_MS=1800000
TRACKER_SUPPORT_MAX_SESSIONS=5000
```

Mount a Railway volume at `/data` if conversational context should survive support-service restarts.

The main JLR service uses the same shared secret plus the support service URL.
