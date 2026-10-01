# CEO COMMAND

Private access is checked on every API route. Only the JLR owner and Renius can use this workspace.

## What is built

- Corporation overview and per-section pull health.
- Monthly income source charts and current corporation wallet division charts.
- Monthly history comes only from ESI journal entries observed by JLR. The 2024 workbook was a development reference and is no longer loaded or displayed.
- Monthly member deposits, withdrawals, transaction counts and exact journal drilldown. Manual loyalty points are a separate optional panel.
- Current Metenox stock, fuel expiry and operating cost projections, alongside corporation structure fuel/service filters. Legacy Athanor pull records are retired.
- Assets, industry jobs, contracts, and market orders with search, filters, pagination, and partial/stale warnings.
- Wallet journal explorer, exact member-party filtering, and links from member records.
- Discord message counts and voice-channel presence, with manual Discord-to-EVE member links.

The original workbook is preserved as a source file. Legacy baseline environment variables are ignored by CEO COMMAND.

## Remaining account setup

### Corporation wallet

Renius opens CEO COMMAND, clicks **CONNECT CORP WALLET**, chooses Renius in EVE SSO, and approves `esi-wallet.read_corporation_wallets.v1`. JLR checks that the returned token actually contains the requested permission before replacing the existing authorization. Refresh CEO data afterward. Other CEO scopes remain usable while wallet setup is pending.

### Discord

1. Create a dedicated application in https://discord.com/developers/applications and obtain its bot token.
2. Copy the corporation's Discord server ID using Discord Developer Mode.
3. Enter the server ID and token in CEO COMMAND's Discord bot setup. If the bot is not installed, use the returned installation link, then reconnect.
4. Grant **View Channels** for the channels to count. JLR uses Guilds, Guild Messages, and Guild Voice States intents. Message Content, Server Members, and Presence privileged intents are not used. The bot never sends messages or joins voice channels.
5. Link observed Discord accounts to EVE members manually if needed. User names are not treated as verified identities.

The token is encrypted using the existing tracker token key. It is never returned by an API, placed in browser storage, or committed. Preserve the tracker state volume and token key. Run one collector instance per state volume.

Message bodies, attachments, and audio are not retained. Voice time includes muted presence and is **not actual speaking time**. Known bots and the server AFK channel are excluded. UTC daily counts are retained for 90 days. Collection begins when connected; historical Discord activity and gaps are not estimated. Pausing preserves saved counts. Switching servers preserves separate histories for each server.

## Pull behavior

CEO data warms after application startup and refreshes in the background every five minutes when core authorization is present. Each section has its own cache or pull status; an operations failure does not block another operation. Refreshing data health inspects state and makes no ESI calls. For a new ESI pull, use the relevant section's refresh button. Wallet journal requests search saved entries rather than pulling ESI repeatedly.

Financial journal retention is bounded to 400 days / 50,000 entries. Loyalty has no automatic scoring formula; corrections use opposite adjustments and retain their history. Up to 250 adjustments are retained per member, with the latest ten shown.

## Verification

Run `npm test`. CEO tests cover API access guards, missing scopes, normalization, pagination, stale results, finance import reconciliation, journal retention, exact member matching, Discord privacy, UTC boundaries, collection gaps, Gateway heartbeat/resume behavior, and preserving setup on failed token validation.

An unconfigured bot makes no Discord network calls. Successful deployment and mocked tests do not establish a live Discord connection; check its connection status after installing the bot. A successful ESI snapshot is labelled separately from an unavailable, partial, or older result.

## Metenox estimates

Metenox records are matched to current ESI structures by type ID. Corporation assets supply reported gas and fuel stock; absent bay rows mean unknown, not zero. Asset totals can include reserves, so stock coverage is not the same as the structure's reported fuel expiry. Partial or failed asset pulls are marked. When ESI omits gas, an explicitly labelled manual reading can be saved with the current assumptions timestamp.

Expected gross revenue for 30 days is entered per drill. Net projections deduct current Jita immediate sell prices for gas and the selected/reported fuel type, optional tax and other costs. They assume 720 operating hours and are estimates, not realized wallet profit. Gas consumption uses 200 units/hour (CCP Version 23.01 patch notes); fuel uses 5 blocks/hour. Fuel prices refresh hourly; CEO assets and structures refresh every five minutes. No old workbook values are used.
