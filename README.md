# Crack the Code

An iOS-friendly two-player browser game built with React, TypeScript, Tailwind CSS, Supabase Auth, PostgreSQL and Realtime.

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

1. Enter your name, choose your mode and play style, then create a room with your bet.
2. In **Room & secret → My secret**, type into the four tiles using the virtual or hardware keyboard, or tap **Choose for me**. Review the random code/word and press **Lock my secret**.
3. Open a **private/incognito browser window or a different browser profile** for player 2. Ordinary tabs share one identity. Enter another name, join the room code, write a bet, and choose/lock a secret.
4. The guest agrees and gets ready. The host starts; both see the countdown and can play. Local updates arrive every second.

Rooms, player identities and locked secrets survive a server restart in the ignored `.local-game/` directory. Unsubmitted drafts are still browser-only and clear on reload. Local sessions last 30 days. If you deliberately reset the database or a session expires, use a fresh private window or clear this site's browser storage to create a new player. Never commit or upload `.local-game/`: it contains private game data. Keep using the same browser profile and address to recover your player.

For an iPhone/iPad on the **same Wi-Fi**, keep the Mac server running and open Vite's printed **Network** URL in Safari. `localhost` on the phone refers to the phone, not this Mac. Allow the local-network connection if macOS prompts. The server must stay running for both players.

Local play is a development server for this Mac/local network, **not public internet hosting**. Do not expose it through port forwarding or an internet tunnel. The local API uses unguessable server-verified session tokens, authorized RPCs, same-origin checks and signup throttling, but it is not a replacement for hosted Supabase's production Auth, TLS and operational controls. **GitHub Pages cannot run this local server.**

For public hosting, follow the Supabase setup below and use `npm run dev`/`npm run build`. Production builds never enable the local backend, even if the build mode is named `local-play`; secrets and the database are never bundled into the website.

## Current rules

- **Number Lock:** four digits, including leading zeros and repeats.
- **Word Lock:** real **four-letter words** from a shared, curated word bank.
- Mint means an item occurs in the secret. Slate means no unmatched copy remains. **No clue reveals whether its position is correct.** Repeated items count only as many times as they occur in the secret, allocated left to right.
- Only the **exact secret in the exact order** wins. Four mint tiles in a different order do not count as a solve.
- Four screens replace the long landing page: **Name → How to play → Room & secret → Play**.
- On **screen 3 → Room → My secret**, each player writes their secret using the four tiles and virtual keyboard, then chooses **Lock my secret**. **Choose for me** fills a random four-digit code or a real word from the word bank using the browser's cryptographic random generator. It shows the result privately for review; players can edit or choose again before locking. It never submits automatically, and unlocked drafts stay in that browser only. Word Lock also offers a searchable bank of real four-letter words. These game secrets are not passwords; never reuse a real password.
- Your own secret is **always visible on your screen** while typing and after locking. A **Your code / Your word** card stays visible during the countdown and gameplay, including while marking hints or waiting for a turn. There is no Show/Hide step. This uses only your authorized `own_secret`; it does not reveal the opponent's answer. Be mindful of people looking at your screen or screen sharing.
- The guest agrees to the displayed bets and gets ready. **Only the room creator can start each round**, after both secrets are locked. Both see a shared six-second countdown.
- **Live race:** both players guess simultaneously; a visible timer tracks elapsed time only.
- **Take turns:** players alternate guesses, with the secret owner manually marking the matching digits/letters. The server verifies the hints before publishing them. There is no elapsed timer on the turns screen. The opening player alternates between the host and guest each round.
- The **first exact solve accepted by the server wins the round immediately**, even if that player used more guesses. Room locks serialize close finishes into one winner.
- Eight guesses per player. If both run out, the round is a draw.
- Best of three: a player reaching two wins ends the match early. Otherwise the match ends after three rounds. A tied final score draws, with no bet won.
- **No time limit** and no automatic room expiry. Elapsed time is recorded but never determines the winner. Disconnected players can return with the same browser identity.

## Written bets

The room creator picks **low stakes** (a little favor) or **high stakes** (a bigger friendly dare) and writes their bet in the field directly below that choice, before creating the room. The guest inherits exactly the host's stakes, mode and play style; they cannot change them. Each player writes what they want **if they win**, up to 120 characters.

Both saved bets are shown to both players before they agree/start. Players can enter their own secrets while preparing the room. Editing either bet clears both agreements; the server rejects agreement/start requests referencing an older wager revision.

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
3. Open **SQL Editor** and run all three migrations **in this order**:
   - [`202610160001_game.sql`](./supabase/migrations/202610160001_game.sql)
   - [`202610160002_race_bets.sql`](./supabase/migrations/202610160002_race_bets.sql)
   - [`202610160003_host_turns.sql`](./supabase/migrations/202610160003_host_turns.sql)
4. Only run migrations you have not applied yet. Existing installations with the first two need **only the third**. Rule-changing migrations intentionally reset existing rooms to preparation with a fresh match; historical rows are retained. Migration three removes Symbol Cipher, adds host-started rounds and manual turns.
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

1. Open the app in a regular browser. Enter your name and continue. On **How to play**, choose Number Lock or Word Lock, then Live race or Take turns. Continue to **Room**, choose low/high stakes, write your bet, then **Create private room**.
2. Open an **incognito/private window, different browser profile, or another device**. Two ordinary tabs share an identity and are not two players.
3. In the second browser, enter another name, continue through How to play, then select **Join room** and enter the room code. Invite links preselect joining. The actual host's mode, play style and stakes replace any local tutorial selection.
4. The guest writes their bet, such as “You bring me a snack,” and selects **Save bet & choose secret**. The creator's bet, such as “You make me a coffee,” was saved at creation.
5. Player A privately enters and locks `1122`; player B enters and locks `3344`. Review the displayed bets. The guest chooses **Agree to bets & ready**, then the host chooses **Agree & start game**. Neither can guess before this or before the shared countdown completes. In Live race both now guess simultaneously, with elapsed time visible.
6. A guesses `3333`: exactly the **first two tiles are mint**, the remaining two are slate. This indicates two copies, not correct positions.
7. A guesses `4433`: all four tiles are mint, but the round must continue because order is wrong.
8. A guesses `3344` first: the round ends immediately in both windows, A gets one point, and the winner screen reveals both secrets. B cannot submit a later winning guess.
9. Both continue. Lock new secrets, get the guest ready, and let the host start each next round. Try B winning round two, then A winning round three: A wins the match, and A's written bet appears. Alternatively A wins rounds one and two: no third round is needed.
10. Both choose **New match · new bets**. Scores reset and the bet fields are blank. Both must write and agree again.
11. Reload either browser while guessing: accepted guesses, scores and your locked secret recover. Unsubmitted guesses, unsubmitted secrets and unsaved bet edits deliberately remain private and disappear on reload.
12. Try Word Lock using `TREE` and `MINT`. `TIME` against `MINT` produces mint/mint/mint/slate, without position clues. Non-words are rejected; use **Word bank** to choose a real word.
13. Create another room with **Take turns** and test the checked-hints flow below.

### Manual hints and anti-cheating

1. Start a Take turns room with A's secret `1122` and B's secret `3344`.
2. A opens round one and guesses `3333`. The guess leaves A's field and B sees a manual clue screen. A sees **no feedback yet** and cannot submit another guess.
3. B sees their own secret privately and taps the first two `3` tiles to mark them mint. Choosing **Check & send hints** with all four slate (or any other wrong combination) is rejected by the server; nothing is sent to A.
4. Correct hints publish to A's history, and it becomes B's guessing turn. A cannot mark their own clues or guess out of turn. Duplicate matches are allocated left to right.
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

Unit/integration tests run **all three actual migrations** in embedded PostgreSQL (PGlite), with test-only auth/roles. They check all 6,561 four-item feedback pairs against a multiset oracle, absence of positional clues, RLS, host authority, shared start gating, simultaneous solves, validated manual hints, turn order, private pending feedback, best-of-three scoring, bet consent/version checks, attempt limits and rematches.

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
- **Word rejected:** select a real four-letter word from the word bank.
- **Clipboard unavailable:** manually share the room code, or use HTTPS.
