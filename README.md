# Crack the Code

An iOS-friendly two-player browser game built with React, TypeScript, Tailwind CSS, Supabase Auth, PostgreSQL and Realtime.

**[Play Crack the Code online](https://asmitakumar97-svg.github.io/crack-the-code/)**

## What is Supabase?

The React app is the part you see in Safari or a desktop browser. **Supabase is the backend**: a hosted database, anonymous player identities, secure game functions, and live updates between the two players. It stores secrets privately and checks guesses, turns and hints on the server, rather than trusting either player's browser.

You need both parts online:

| Part | Where it can live |
| --- | --- |
| Website / React build | GitHub Pages, Netlify, Vercel, Cloudflare Pages, or another static HTTPS host |
| Database + multiplayer | Your Supabase project |
| Source code | A public or private GitHub repository |

The website and repository can be **public**. Players still use room codes to find each other; secret codes and unchecked hints are never public. No GitHub account is needed to play. The `private` flag in `package.json` only prevents accidental npm package publication; it does not control GitHub visibility.

This is a responsive **web game**, not a native App Store app: the same public URL works on iPhone/iPad Safari and desktop browsers.

## Play on localhost now (no Supabase account needed)

```sh
npm run dev:local
```

Open the printed localhost URL, normally `http://localhost:5173/`. This starts a **real local multiplayer server**, not a mock opponent. It uses embedded PostgreSQL, the same migrations, server-side rules, RLS and private secret storage as the hosted game. A visible **Local multiplayer** banner distinguishes it from Supabase-backed online play.

1. Enter your name, choose your mode, play style and stakes, then create a room. There is no bet field at room creation.
2. Open a **private/incognito browser window or a different browser profile** for player 2. Ordinary tabs share one identity. Join with the room code.
3. Each player first chooses a four-digit code or six-letter word, or taps **Choose for me**, then **Lock my secret**. Locking successfully opens **The bets** automatically. Write and save both bets, then each chooses **Agree to bets**.
4. **Start game** appears on the host's **bets screen** once both players have agreed and locked secrets. Both see the countdown and can play. Local updates arrive every second.

Rooms, player identities and locked secrets survive a server restart in the ignored `.local-game/` directory. Unsubmitted drafts are still browser-only and clear on reload. Local sessions last 30 days. If you deliberately reset the database or a session expires, use a fresh private window or clear this site's browser storage to create a new player. Never commit or upload `.local-game/`: it contains private game data. Keep using the same browser profile and address to recover your player.

For an iPhone/iPad on the **same Wi-Fi**, keep the Mac server running and open Vite's printed **Network** URL in Safari. `localhost` on the phone refers to the phone, not this Mac. Allow the local-network connection if macOS prompts. The server must stay running for both players.

Local play is a development server for this Mac/local network, **not public internet hosting**. Do not expose it through port forwarding or an internet tunnel. The local API uses unguessable server-verified session tokens, authorized RPCs, same-origin checks and signup throttling, but it is not a replacement for hosted Supabase's production Auth, TLS and operational controls. **GitHub Pages cannot run this local server.**

For public hosting, follow the Supabase setup below and use `npm run dev`/`npm run build`. Production builds never enable the local backend, even if the build mode is named `local-play`; secrets and the database are never bundled into the website.

## Current rules

- **Number Lock:** four digits, including leading zeros and repeats.
- **Word Lock:** real **six-letter words**, checked against the game's internal dictionary. There is no visible word-bank button or list.
- **Wordle-style clues in both modes:** green/mint means the correct digit or letter in the correct position; yellow means a matching item in the wrong position; grey/slate means no unused matching copy remains. Exact positions are reserved first, then remaining copies are allocated left to right. A grey extra copy does not mean that character is entirely absent.
- Only the **exact secret in the exact order** wins. All-yellow tiles do not count as a solve. Keyboard colours retain the strongest earned clue: green before yellow before grey.
- Four screens replace the long landing page: **Name → How to play → Room & secret → Play**.
- On **screen 3 → Room → My secret**, each player writes their secret using four number tiles or six letter tiles and the virtual keyboard, then chooses **Lock my secret**. Word keys have at least 58px height and larger labels, including on small phones. **Choose for me** fills a random four-digit code or real six-letter word using the browser's cryptographic random generator. Players can edit or choose again before locking. It never submits automatically, and unlocked drafts stay in that browser only. The internal dictionary still validates words and supplies random secrets, but is not shown as a browsable list. These game secrets are not passwords; never reuse a real password.
- Your own secret is **always visible on your screen** while typing and after locking. A **Your code / Your word** card stays visible during the countdown and gameplay, including while marking hints or waiting for a turn. There is no Show/Hide step. This uses only your authorized `own_secret`; it does not reveal the opponent's answer. Be mindful of people looking at your screen or screen sharing.
- Setup is **Secret → Bets → Agree → Play**. Both players choose and lock their secrets before accessing bets. A successful lock opens **The bets** automatically; failed validation stays on secret entry. Bet editing, review, agreement and **Start game / Start round** live only on the bets screen. Only the host can start, once both secrets are locked and both players have agreed. The server enforces the same requirements. Reloading a locked secret returns to Bets, with your own secret still visible. Both see a shared six-second countdown.
- **Live race:** both players guess simultaneously; a visible timer tracks elapsed time only.
- **Take turns:** exactly one guess each, alternating without a turn limit. The secret owner marks green, yellow or grey clues; tap a tile to cycle grey → yellow → green. The server verifies hints before publishing them. There is no elapsed timer on this screen. The opening player swaps each round. The first correct answer ends the round immediately; there is no extra reply guess after a solve.
- The **first exact solve accepted by the server wins the round immediately**, even if that player used more guesses. Guessing stops for both players and both secrets are revealed. Room locks serialize close finishes into one winner; late guesses cannot change the result. Both players choose **Ready for round N** before setting new secrets, then the host explicitly starts. Bet agreements carry across rounds and reset on a new match or a changed bet. There is no automatic next-round timer.
- **Unlimited guesses** in both modes. Attempt counts remain visible, without a maximum. There is no automatic draw after eight guesses.
- Best of three: a player reaching two wins ends the match early. Otherwise the match ends after three rounds. A tied final score draws, with no bet won.
- **No time limit** and no automatic room expiry. Elapsed time is recorded but never determines the winner. Disconnected players can return with the same browser identity.

## Written bets

The room creator picks **low stakes** (a little favor) or **high stakes** (a bigger friendly dare) when creating the room. The guest inherits exactly the host's stakes, mode and play style; they cannot change them. Each player chooses a secret first, then writes what they want **if they win** on the Bets screen, up to 120 characters.

Both saved bets are shown only on **The bets** tab. Each player chooses **Agree to bets** there, without navigating away; the host's **Start game** button appears there once both are ready. Bet cards, agreement and Start are not duplicated on **My secret**. The Bets tab is disabled until your secret is locked. You can revisit your locked secret and select **Continue to bets**. Editing either bet clears both agreements and hides Start until both agree again; unsaved edits also hide Start. The server rejects agreement/start requests referencing an older wager revision.

One pair of bets applies to the **whole best-of-three match**, not each round. The winner screen displays the winning player's written bet. A rematch returns both players to the lobby to write and agree new bets. These are friendly, consensual dares only: there are no payments, monetary balances, or automatic enforcement.

## Setup

### 1. Install

Use Node.js 22.12+ or a newer supported LTS:

```sh
git clone https://github.com/asmitakumar97-svg/crack-the-code.git
cd crack-the-code
npm ci
```

Node was installed with Homebrew on this development machine. If your terminal cannot find it:

```sh
export PATH="/opt/homebrew/bin:$PATH"
```

### 2. Configure Supabase

1. Create a project at [Supabase](https://supabase.com/dashboard).
2. Under **Authentication → Sign In / Providers**, enable **Anonymous Sign-Ins**.
3. Open **SQL Editor** and run all six migrations **in this order**:
   - [`202610160001_game.sql`](./supabase/migrations/202610160001_game.sql)
   - [`202610160002_race_bets.sql`](./supabase/migrations/202610160002_race_bets.sql)
   - [`202610160003_host_turns.sql`](./supabase/migrations/202610160003_host_turns.sql)
   - [`202610160004_wordle_feedback.sql`](./supabase/migrations/202610160004_wordle_feedback.sql)
   - [`202610160005_six_letter_unlimited.sql`](./supabase/migrations/202610160005_six_letter_unlimited.sql)
   - [`202610160006_code_first_setup.sql`](./supabase/migrations/202610160006_code_first_setup.sql)
4. Only run migrations you have not applied yet. Existing installations with the first four need **the fifth and sixth**, each run as one complete query. Migrations two and three restart matches; migration four preserves matches while recalculating Wordle clues. Migration five preserves Number Lock games, removes guess limits, separates consent from secret entry, and replaces the internal dictionary with six-letter words. **Existing Word Lock rooms restart at preparation with their bets retained**, because four-letter secrets cannot be played with six-letter guesses; historical secrets/results remain protected. No RLS policies or client permissions change. Apply the migrations before deploying the frontend, then refresh both players' game pages.
   Installations already on migration five need **only migration six**. Migration six allows room creation before writing a bet and requires a locked secret before agreeing. It preserves all existing rooms, secrets, guesses, scores and bets, and changes no table permissions or RLS policies.
5. Verify **Database → Publications → supabase_realtime** contains `rooms` only for this app. Do **not** publish `secrets` or `guesses`.
6. Copy your project URL and **publishable key** (or legacy public `anon` key). Never use a secret/service-role key in the browser.

Alternatively, with a linked Supabase CLI:

```sh
supabase init
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Enable anonymous sign-ins in the hosted dashboard even when using the CLI. The SQL Editor route needs neither Docker nor local PostgreSQL.

### 3. Add environment variables

```sh
cp .env.example .env
```

Edit `.env`:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-public-anon-key
```

The template is [`.env.example`](./.env.example). Both variables are public, embedded frontend configuration. RLS and RPC permissions protect data. `.env` is ignored by Git.

```sh
npm run dev
```

Open Vite's printed address, usually `http://localhost:5173`. Restart after changing environment variables. Without a backend connection, the app explicitly reports setup is needed; it never pretends to have a real opponent.

## Test two people playing simultaneously

1. Open the app in a regular browser. Enter your name and continue. On **How to play**, choose Number Lock or Word Lock, then Live race or Take turns. Continue to **Room**, choose low/high stakes, then **Create private room**, without entering a bet.
2. Open an **incognito/private window, different browser profile, or another device**. Two ordinary tabs share an identity and are not two players.
3. In the second browser, enter another name, continue through How to play, then select **Join room** and enter the room code. Invite links preselect joining. The actual host's mode, play style and stakes replace any local tutorial selection.
4. Player A privately locks `1122`; player B locks `3344`. Before locking, Bets is disabled. Each successful lock opens **The bets** automatically; invalid entries must not advance. Your own secret remains visible on this screen.
5. Both write their bets (for example “You make me a coffee” / “You bring me a snack”), select **Save bet**, then **Agree to bets**, staying on this screen. **Start game** appears only on A's bets screen after both are ready. B never gets Start; the secret screen never shows bet controls or Start. The host starts; neither can guess before the countdown completes. In Live race both now guess simultaneously, with elapsed time visible.
6. A guesses `3333`: exactly the **first two tiles are green**, the remaining two are grey. The two correctly positioned copies consume both `3`s in the secret.
7. A guesses `4433`: all four tiles are yellow, and the round continues because every item is in the wrong position.
8. A guesses `3344` first: the round ends immediately in both windows, A gets one point, and the winner screen reveals both secrets. B cannot submit a later winning guess.
9. A selects **Ready for round 2**; both stay on the reveal screen until B also chooses it. Lock new secrets and let the host start; no repeated bet agreement is needed. Try B winning round two, then A winning round three: A wins the match, and A's written bet appears. Alternatively A wins rounds one and two: no third round is needed.
10. Both choose **New match · new bets**. Scores reset and the bet fields are blank. Both must write and agree again.
11. Reload either browser while guessing: accepted guesses, scores and your locked secret recover. Unsubmitted guesses, unsubmitted secrets and unsaved bet edits deliberately remain private and disappear on reload.
12. Try Word Lock with A's `LETTER` and B's `SECRET`. A guesses `STREET`: green/grey/yellow/yellow/green/green. The correctly positioned final `T` consumes that copy, so the extra `T` is grey. `XXXXXX` is rejected. There is no word-bank list; **Choose for me** is available only for picking a secret. Check six tiles throughout entry, own-secret cards, history, manual hints and reveals.
13. Submit at least ten wrong race guesses; play must continue with the timer running. In **Take turns**, alternate at least ten guesses each: no timer, no extra consecutive guesses, no automatic draw. Continue until one player solves.

### Manual hints and anti-cheating

1. Start a Take turns room with A's secret `1122` and B's secret `3344`.
2. A opens round one and guesses `3333`. The guess leaves A's field and B sees a manual clue screen. A sees **no feedback yet** and cannot submit another guess.
3. B sees their own secret privately and taps the first two `3` tiles twice each to mark them green (grey → yellow → green). Choosing **Check & send hints** with all four grey (or any other wrong combination) is rejected by the server; nothing is sent to A.
4. Correct hints publish to A's history, and it becomes B's guessing turn. A cannot mark their own clues or guess out of turn. Mark exact positions green first, then assign remaining matching copies yellow from left to right.
5. An exact secret match is always resolved by the server immediately, without waiting for the other player to approve the win. A losing player cannot suppress a legitimate win by refusing to send clues.
6. Reload either browser while hints are pending. The submitted guess recovers; unsent clue selections do not. The secret owner's screen can mark the hints again.

Unchecked guesses live in an inaccessible `private.pending_guesses` table. Neither direct table reads nor state RPCs expose their calculated feedback before correct hints are confirmed. Saved checked guess history remains visible only to the guesser; the submitted pending guess is deliberately shown to its secret owner in this mode.

This prevents **false hints, forged turns, self-confirmed clues, score edits and hidden answer access through the app**. It cannot stop somebody stalling, sharing answers outside the app, or otherwise coordinating off-platform. There is no automatic forfeit or turn deadline.

### iPhone / iPad

- Safari on iOS 16.4+ is the supported browser target; desktop Safari, Chrome and Firefox also work.
- Use an HTTPS deployment for cross-device play and clipboard sharing. To try over your local Wi-Fi, open Vite's Network URL on the phone; clipboard access may be blocked on plain HTTP, so share the visible code manually.
- Safe-area padding, dynamic viewport sizing, 16px text inputs (avoids automatic input zoom), large controls, touch keyboards, and reduced-motion support are included.
- Code entry uses the game's virtual keyboard (`inputmode="none"`) to avoid opening a second iOS keyboard. Hardware keyboard input still works.
- An actual device check is recommended before publishing; automated browser tests include mobile Chromium and WebKit.

## Backend and privacy

Each browser gets a separate authenticated anonymous Supabase user. All writes go through database RPCs. Mutation functions lock the room row so readiness, wagers, guesses, first-finisher selection and rematches cannot race. Expected match/round/attempt values reject stale or repeated requests.

| Data | Client read access | Writes |
| --- | --- | --- |
| `rooms`, `players`, `round_results` | Room members only | RPCs only |
| `secrets` | Own rows only, plus membership | Secret RPC only |
| `guesses` | Own rows only, plus membership | Guess RPC only |
| `word_bank` | Authenticated users | Migration/admin |
| `private` schema | None | Internal helpers |

`get_game_state` returns the authorized public match state, your own secret, your own checked guesses, an active submitted guess awaiting manual hints when applicable, and completed-round results. Opponent secrets are revealed only after the server finalizes a round. Drafts never leave component memory. Saved bets are deliberately shared with the other room member.

Only `rooms` is published to Realtime. A version increment prompts clients to refetch their own state. Five-second authenticated polling provides recovery and works when WebSockets fail. A shared future start timestamp gives both clients a countdown before guesses are accepted. There is no client broadcast of secrets or drafts.

Secrets are protected by RLS and permissions, not end-to-end encryption; administrators/service-role users can read database contents. Use game codes, never real passwords.

Join requests are limited to 30/minute/identity, creation to 10/hour/identity. Configure Supabase Auth rate limits and bot protection before a public launch; new anonymous identities can otherwise evade identity-based quotas.

Returning home does not free a seat. Rejoin with the same browser and room code. Clearing browser storage loses the anonymous identity; start a new room if that happens. A disconnected player does not forfeit automatically. Rooms/history are retained until an administrator deletes them.

## Verification

```sh
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
npm run test:local
```

Unit/integration tests run **all six actual migrations** in embedded PostgreSQL (PGlite), with test-only auth/roles. They check all 6,561 four-item feedback pairs against an independent position-and-frequency oracle, six-letter duplicate handling, legacy migration without resetting Number Lock, RLS, host authority, shared start gating, simultaneous solves, validated manual hints, unlimited alternating turns, best-of-three scoring, code-before-consent enforcement and rematches. Browser tests verify six-letter words, larger word keys, absence of a visible word bank, code-first setup, automatic navigation to Bets only after successful locking, bets-only agreement/start, reload recovery, more than eight race guesses, colours, synchronized reveals and waiting for both players before advancing.

Browser tests use two isolated contexts connected to those same real SQL functions through a **test-only transport**. WebSockets are disabled to verify polling recovery. This is not a replacement for testing a real hosted Supabase project: follow the two-person checklist to verify hosted Auth, PostgREST and Realtime.

`npm run test:local` separately starts the real local HTTP server with an ephemeral in-memory database and drives mobile Chromium/WebKit and desktop browsers without intercepting any backend requests. HTTP tests cover private secrets, authentication/identity isolation, origin/argument checks and persistence across a disk-backed server restart.

## Deployment and troubleshooting

Build with `npm run build` and host `dist/` on any static HTTPS host. Set both environment variables in its build environment before building. Invite links use a query string and need no SPA routing rewrite. All devices must point to the same Supabase project.

### Public GitHub repository + GitHub Pages

The included [GitHub Actions workflow](./.github/workflows/deploy-pages.yml) builds, tests and publishes the website.

1. Complete the Supabase setup and migrations above.
2. Create a **public** GitHub repository, for example `crack-the-code`.
3. Upload/push this project to its `main` branch. Include source files, `package.json`, `package-lock.json`, migrations, and the `.github` workflow folder. **Do not upload `.env` or `node_modules`.** Git ignores them when using Git.
4. In the repository, open **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.
5. Open **Settings → Secrets and variables → Actions → Variables** and add these **repository variables**:
   - `VITE_SUPABASE_URL`: your project URL.
   - `VITE_SUPABASE_ANON_KEY`: your Supabase **publishable/public anon key**, never a service-role or secret key.
6. In **Actions**, select **Deploy game to GitHub Pages → Run workflow**. Future pushes to `main` deploy automatically.
7. When the deployment finishes, open the URL displayed by the action, usually `https://YOUR_USERNAME.github.io/crack-the-code/`.
8. Share that URL with your friend. Both browsers must connect to the same Supabase project. Test with a private browser window or a different device.

The workflow reads GitHub Pages' actual base path, so JavaScript, CSS and icons work under a repository URL rather than incorrectly loading from the domain root. It also handles a root user-site or an already-configured custom domain. It deliberately fails if the two backend variables are missing.

GitHub Pages serves **static files only**; it cannot run the database or validate multiplayer on its own. Supabase is still required. Its public key being visible is expected—RLS and server functions protect the game data.

### Other hosts

For Vercel or Netlify, use build command `npm run build`, output directory `dist`, and the same two public environment variables. Leave the Vite base path at `/` for a normal root-domain deployment.

- **Sign-in errors:** enable Anonymous Sign-Ins and review Supabase Auth limits.
- **Missing function / old rules:** apply unapplied migrations in order; installations with migrations one and two need migration three.
- **Only one player:** use separate profiles/private windows.
- **No updates:** check Realtime publication membership; polling still refreshes every five seconds.
- **Bets changed:** read the new bets and agree again. Changing any bet intentionally clears both agreements.
- **Word rejected:** enter a real six-letter word recognized by the game's dictionary. The word-bank list is hidden; **Choose for me** can pick a valid secret.
- **Clipboard unavailable:** manually share the room code, or use HTTPS.
