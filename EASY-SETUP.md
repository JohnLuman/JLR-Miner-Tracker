# JLR Miner Tracker — Easy Web Setup (No Command Prompt)

Recommended beginner path: GitHub + Railway + EVE SSO.

1. Upload the contents of this folder to a GitHub repository. Make sure `Dockerfile`, `server.mjs`, `package.json`, `source-data.json`, and the `public` folder are at the repository root.
2. In Railway, create a project from that GitHub repository. Railway will use the included Dockerfile.
3. Add a Railway Volume mounted at `/app/data` BEFORE linking any EVE characters. This stores field states, timers, encrypted refresh tokens, and fleet Actual totals.
4. In Railway Settings > Networking, choose Generate Domain. Copy the resulting `https://...up.railway.app` URL.
5. In EVE Developers, create a web application. Set the callback to `https://YOUR-RAILWAY-DOMAIN/auth/eve/callback` and request only `esi-industry.read_character_mining.v1`.
6. In Railway > your service > Variables, add:
   - `PUBLIC_URL` = your full Railway https URL (no trailing slash)
   - `EVE_CLIENT_ID` = EVE developer Client ID
   - `EVE_CLIENT_SECRET` = EVE developer Client Secret
   - `ESI_USER_AGENT` = `JLR-Miner-Tracker/2.1 contact=YOUR-CONTACT`
7. Deploy the staged Railway changes.
8. Open your Railway URL and click Log in with EVE Online. After login, use + Add Toon for more characters.

`SESSION_SECRET` and `TOKEN_ENCRYPTION_KEY` can be left unset for the first deployment if `/app/data` is mounted first: JLR creates a random persistent token key in that volume and derives the session secret from it. You can later supply fixed secrets if desired.
