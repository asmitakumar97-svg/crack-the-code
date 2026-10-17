# Turn notifications

## What players get

In a **Take turns** room, **Enable turn alerts** opts into a short sound and, if supported/allowed, a browser notification while the game remains open. Browser notifications appear when the page is not focused. This opt-in lasts for the current visit; reloads require another click to unlock sound under browser autoplay rules.

Alerts are generated when the opponent submits a guess that needs your clues, or when a new incoming turn needs your guess. Repeated polling/heartbeats do not replay them. Sending your own clues does not ping you again for your immediate follow-up guess. Race games and solo puzzles do not generate turn alerts. Notification text contains no names, bets, guesses or secrets.

**Phone notifications** are a separate, persistent device opt-in. They use encrypted Web Push, a service worker, and server-triggered delivery, so they do not depend on the game tab polling while another app is open. Delivery is best-effort: device Focus modes, disabled permissions, network connectivity and OS/browser restrictions can delay or suppress it.

### iPhone / iPad

1. Use iOS/iPadOS 16.4 or later.
2. Open the game in Safari and choose **Share → Add to Home Screen**.
3. Open the game using its new Home Screen icon. Sign in with the same Google account there if you want to recover an existing account's room; the installed app may have a different guest identity from Safari.
4. Join your room from this installed app, then choose **Enable phone notifications** and allow notifications.
5. If necessary, allow notifications for the installed game in device Settings and check Focus mode.

Android/desktop browsers supporting Web Push can generally enable it directly. Do not promise alerts after the browser/app is explicitly force-stopped; platform behavior varies.

## Server setup (project owner, once)

Open-game alerts need no database migration or secrets. **Phone push is disabled until every step below is complete.** None of the private keys belong in `VITE_` variables, GitHub Pages, source control, screenshots, or chat.

### 1. Apply migration eleven

Run [202610170011_turn_notifications.sql](../supabase/migrations/202610170011_turn_notifications.sql) as a complete query in Supabase SQL Editor, after migrations one through ten. It preserves rooms, scores, guesses, secrets and existing bet history. Do not rerun an already-applied migration.

This creates private device subscriptions, a transactionally queued notification outbox, and owner-authorized subscription RPCs. No private tables are added to Realtime. Only the service role can claim or finish delivery jobs.

### 2. Generate private notification keys locally

From the repository directory:

```sh
node scripts/configure-turn-push.mjs wxmrxcnfivgkmhdhedwf
```

The command creates two Git-ignored, owner-readable files:

- `.env.turn-push`: VAPID public/private keys, a VAPID contact URL, and a separate random dispatch token.
- `.turn-push-setup.sql`: private database dispatch configuration and the retry schedule.

It never prints key values and refuses to overwrite existing files. Keep a secure backup: rotating VAPID keys later requires devices to resubscribe.

### 3. Configure Edge Function secrets

Open **Supabase → Edge Functions → Secrets**. Open `.env.turn-push` locally and add its four entries:

- `TURN_PUSH_PUBLIC_KEY`
- `TURN_PUSH_PRIVATE_KEY`
- `TURN_PUSH_SUBJECT`
- `TURN_PUSH_DISPATCH_TOKEN`

Use their exact generated values. Supabase already supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the Edge Function; do not copy a service-role key into the frontend.

If the Supabase CLI is installed and authenticated, the equivalent is:

```sh
supabase secrets set --project-ref wxmrxcnfivgkmhdhedwf --env-file .env.turn-push
```

### 4. Deploy the dispatcher

In **Edge Functions → Deploy a new function → Via Editor**, name the function **`turn-push`**. Replace its source with [index.ts](../supabase/functions/turn-push/index.ts), then deploy. In the function's settings, turn **Verify JWT / Enforce JWT verification OFF**. Requests are instead authenticated by the private `x-turn-push-token` header; anonymous requests are rejected before any device data is read.

CLI alternative:

```sh
supabase functions deploy turn-push --project-ref wxmrxcnfivgkmhdhedwf --no-verify-jwt
```

[config.toml](../supabase/config.toml) also records this JWT setting.

### 5. Connect database delivery and retries

Open `.turn-push-setup.sql` **locally**, then run it as one complete query in Supabase SQL Editor. It contains private keys: do not commit it, screenshot it or paste it into chat.

The final result must show **`push_configured = true`** and **`retry_job_active = true`**. It enables `pg_net` and `pg_cron`, stores dispatch configuration privately, and schedules a minute-by-minute retry sweep. Newly queued events dispatch immediately through `pg_net`; the sweep recovers transient failures and expired processing leases, trying at most three times. Successful devices are not retried; expired subscriptions are removed. Queued events are checked against current room state before sending; stale events are skipped, and notification jobs expire after five minutes. Push-service TTL is 120 seconds, so an already-delivered notification can briefly outlive a turn.

Job metadata is deleted after seven days. Private device subscriptions remain until disabled, expired or the account is deleted.

### 6. Enable and redeploy the frontend

In repository **Settings → Secrets and variables → Actions → Variables**, set:

```text
VITE_PHONE_PUSH_ENABLED=true
```

Rerun the **Deploy game to GitHub Pages** workflow. For local frontend development against hosted Supabase, use that flag in `.env` and restart Vite. The local PGlite server does not deliver phone push.

Only the public VAPID key reaches the browser through an authenticated RPC. The frontend build never contains the private VAPID key or dispatch token.

## Two-device verification

1. Open a **Take turns** room on two devices. For iPhone, do this from the installed Home Screen app.
2. On player B's device, enable phone notifications. Switch to a different app or lock the phone.
3. On player A's device, submit a wrong guess.
4. B should receive a generic **your move** notification telling them to mark clues. Tap it: it must return to that exact authorized room, even if another room was saved previously.
5. Send the clues. B should not get another notification just because they sent their own clues. B can now guess.
6. Confirm A gets their incoming clue-marking notification, polling does not replay notifications, and an exact solve ends both players without another turn alert.
7. Disable phone notifications on a device and confirm no new pushes arrive there. Account switching also unregisters that device before switching identities.
8. Repeat with permission denied: explain how to enable it; never claim success.

**Real phone push cannot be verified before backend configuration and a device permission grant.** Automated tests validate private subscriptions, authorized dispatch, encrypted request generation, retries, stale jobs, expired-device cleanup, service-worker payload/click handling and open-page alert behavior. They do not substitute for this physical-device check.

Run `npm test`, `npm run test:e2e -- tests/e2e/turn-alerts.spec.ts` and `npm run test:push` for the focused automated checks. The last command uses a separate test server with the phone flag enabled and mocked browser push APIs, backed by the actual authorized SQL functions. The Edge Function can also be type-checked with `deno check --node-modules-dir=none --no-lock supabase/functions/turn-push/index.ts`.

## Troubleshooting

- **Phone button disabled:** frontend flag is off, or this is the local development server.
- **Phone push not configured:** migration/configuration is missing. Verify all setup steps before enabling the flag.
- **Permission denied:** change device/browser site notification settings, then enable again. No repeated automatic permission prompts.
- **iPhone has no push support:** open the installed Home Screen app, not a normal Safari tab. Check OS version.
- **No delivery:** inspect `turn-push` Edge Function logs and the private outbox as the project administrator. Failed events retain a safe error message; the device control also reports the player's most recent failure. Check the cron job is active and the Edge Function dispatch token matches the database setting.
- **`401` from `turn-push`:** verify JWT checking is disabled for this function, and compare the private dispatch token between Edge secrets and `.turn-push-setup.sql` without sharing it.
- **VAPID errors:** ensure the public/private key pair matches. Do not generate a fresh pair as a routine fix.
- **Expired subscription:** `404`/`410` responses remove it on the server; enable again on that device.

Push destinations are restricted to known HTTPS Chrome/Firefox/Apple/Windows push-service hosts; arbitrary URLs, credentials, custom ports and local-network destinations are rejected. The private dispatcher never accepts a client-supplied message, recipient or push endpoint.
