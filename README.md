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
- **Word Lock:** real **six-letter words**, checked by the server against an expanded English dictionary of over 11,000 words, including common inflections and American/British spellings. `NORMAL`, `APPLES` and `FRUITS` are accepted. Any valid word may be tried, even if it contradicts previous green/yellow clues: this is not a forced-clue or hard mode. The browser checks length/characters only, so a loading, stale or unavailable local dictionary cannot wrongly reject a valid word; the server still rejects made-up entries such as `XXXXXX`. There is no visible word-bank button or list.
- **Wordle-style clues in both modes:** green/mint means the correct digit or letter in the correct position; yellow means a matching item in the wrong position; grey/slate means no unused matching copy remains. Exact positions are reserved first, then remaining copies are allocated left to right. A grey extra copy does not mean that character is entirely absent.
- Only the **exact secret in the exact order** wins. All-yellow tiles do not count as a solve. Keyboard colours retain the strongest earned clue: green before yellow before grey.
- Four screens replace the long landing page: **Name → How to play → Room & secret → Play**.
- On **screen 3 → Room → My secret**, each player writes their secret using four number tiles or six letter tiles and the virtual keyboard, then chooses **Lock my secret**. Word keys have at least 58px height and larger labels, including on small phones. **Choose for me** fills a random four-digit code or real six-letter word using the browser's cryptographic random generator. Players can edit or choose again before locking. It never submits automatically, and unlocked drafts stay in that browser only. The internal dictionary still validates words and supplies random secrets, but is not shown as a browsable list. These game secrets are not passwords; never reuse a real password.
- Your own secret is **always visible on your screen** while typing and after locking. A **Your code / Your word** card stays visible during the countdown and gameplay, including while marking hints or waiting for a turn. There is no Show/Hide step. This uses only your authorized `own_secret`; it does not reveal the opponent's answer. Be mindful of people looking at your screen or screen sharing.
- Setup is **Secret → Bets → Agree → Play**. Both players choose and lock their secrets before accessing bets. A successful lock opens **The bets** automatically; failed validation stays on secret entry. Bet editing, review, agreement and **Start game / Start round** live only on the bets screen. Only the host can start, once both secrets are locked and both players have agreed. The server enforces the same requirements. Reloading a locked secret returns to Bets, with your own secret still visible. Both see a shared six-second countdown.
- **Live race:** both players guess simultaneously; a visible timer tracks elapsed time only.
- **Take turns:** exactly one guess each, alternating without a turn limit. The secret owner taps matching tiles in the submitted guess; each tap automatically chooses green for an exact position or yellow for a remaining matching copy. Tap again to deselect. Non-matches stay grey, and tapping one explains that no unused match remains. **Check & send hints** highlights missed matching tiles and names their positions, without sending incomplete clues or advancing the turn. Colours use only the owner's authorized secret and reserve exact copies before allocating yellow copies left to right, regardless of tap order. The server independently verifies all hints before publishing them. There is no elapsed timer on this screen. The opening player swaps each round. The first correct answer ends the round immediately; there is no extra reply guess after a solve.
- The **first exact solve accepted by the server wins the round immediately**, even if that player used more guesses. Guessing stops for both players and both secrets are revealed. Room locks serialize close finishes into one winner; late guesses cannot change the result. Both players choose **Ready for round N** before setting new secrets, then the host explicitly starts. Bet agreements carry across rounds and reset on a new match or a changed bet. There is no automatic next-round timer.
- **Unlimited guesses** in both modes. Attempt counts remain visible, without a maximum. There is no automatic draw after eight guesses.
- Best of three: a player reaching two wins ends the match early. Otherwise the match ends after three rounds. A tied final score draws, with no bet won.
- **No time limit** and no automatic room expiry. Elapsed time is recorded but never determines the winner. Disconnected players can return with the same browser identity.
- **Pastel / Dark themes:** choose in the header. Pastel is the default; the preference is saved on that browser and survives reloads. Green/yellow/grey meanings and clue symbols stay the same in both themes.
- **Private bet history:** open the player icon in the header. Completed matches preserve the original winning bet, opponent display name, date and scores, even after rematches or changed bets. Filter wins/losses/all results, search by opponent name, and load older entries. Only the two participants can read each record. Guest history belongs to the guest identity; Google accounts make future signed-in games accessible across devices after provider setup below. No codes, guesses, email addresses or Google profile details are included in history.

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
3. Open **SQL Editor** and run all eight migrations **in this order**:
   - [`202610160001_game.sql`](./supabase/migrations/202610160001_game.sql)
   - [`202610160002_race_bets.sql`](./supabase/migrations/202610160002_race_bets.sql)
   - [`202610160003_host_turns.sql`](./supabase/migrations/202610160003_host_turns.sql)
   - [`202610160004_wordle_feedback.sql`](./supabase/migrations/202610160004_wordle_feedback.sql)
   - [`202610160005_six_letter_unlimited.sql`](./supabase/migrations/202610160005_six_letter_unlimited.sql)
   - [`202610160006_code_first_setup.sql`](./supabase/migrations/202610160006_code_first_setup.sql)
   - [`202610160007_expanded_dictionary.sql`](./supabase/migrations/202610160007_expanded_dictionary.sql)
   - [`202610160008_bet_history.sql`](./supabase/migrations/202610160008_bet_history.sql)
4. Only run migrations you have not applied yet. Existing installations with the first four need **five through eight**, each run as one complete query. Migrations two and three restart matches; migration four preserves matches while recalculating Wordle clues. Migration five preserves Number Lock games, removes guess limits, separates consent from secret entry, and replaces the internal dictionary with six-letter words. **Existing Word Lock rooms restart at preparation with their bets retained**, because four-letter secrets cannot be played with six-letter guesses; historical secrets/results remain protected. Migrations five through seven do not change existing RLS policies or client permissions; eight adds protected history. Apply the migrations before deploying the frontend, then refresh both players' game pages.
   Installations already on migration five need **six, seven and eight**; installations on six need **seven and eight**. Migration six allows room creation before writing a bet and requires a locked secret before agreeing. Migration seven adds dictionary entries without removing existing words or resetting games. Migration eight adds a read-only, participant-protected history table and snapshots each completed match before a rematch can overwrite its bets. It also archives rooms currently at `match_over`; bets from older, already-rematched games cannot be reconstructed. These updates preserve existing rooms, secrets, guesses, scores and bets. Do not add `bet_history` to Realtime publications.
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
3. B sees their own secret privately. Choosing **Check & send hints** before selecting any tiles highlights positions 1 and 2 as missed clues; nothing is sent to A. Tap each of the first two `3` tiles once: they automatically turn green. Tapping an extra `3` leaves it grey and explains that no unused copy remains. Tap a selected tile again to deselect it, then check again to see the missed-position warning.
4. Select both matching tiles and choose **Check & send hints**. The server independently verifies the colours, correct hints publish to A's history, and it becomes B's guessing turn. A cannot mark their own clues or guess out of turn. Exact positions are reserved first and remaining matching copies become yellow left to right, even when tiles are tapped in a different order. For an entirely non-matching guess, all-grey clues can be sent without selecting any tiles.
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

Unit/integration tests run **all eight actual migrations** in embedded PostgreSQL (PGlite), with test-only auth/roles. They compare client/server feedback for all 6,561 four-item pairs against an independent oracle, check expanded dictionary coverage and unrestricted valid guesses, and cover game authorization, best-of-three play, immutable participant-only history and cursor pagination. Browser tests cover code-first setup, larger keys, automatic clue colours, missed/invalid/deselected clues, all-grey feedback, unlimited guesses, synchronized stops/reveals, saved themes and private history. Cross-device account history is tested with isolated sessions sharing the same authenticated identity; real Google login requires the provider setup below.

Browser tests use two isolated contexts connected to those same real SQL functions through a **test-only transport**. WebSockets are disabled to verify polling recovery. This is not a replacement for testing a real hosted Supabase project: follow the two-person checklist to verify hosted Auth, PostgREST and Realtime.

`npm run test:local` separately starts the real local HTTP server with an ephemeral in-memory database and drives mobile Chromium/WebKit and desktop browsers without intercepting any backend requests. HTTP tests cover private secrets, authentication/identity isolation, origin/argument checks and persistence across a disk-backed server restart.

## English dictionary

The expanded word list is generated from [SCOWL 2020.12.07](https://wordlist.aspell.net/), combining English, American, British (`-ise` and `-ize`), Canadian and Australian `words` lists and level-one spelling variants through size 70. It keeps only lowercase ASCII six-letter entries, converts them to uppercase, and retains all previously accepted words. Proper-name lists, abbreviations, apostrophes and accented/hyphenated entries are not imported. This is a broad offline dictionary, not a guarantee of every technical term or newly coined word.

The permitted redistribution terms and source credits are included verbatim in [`third-party/SCOWL-Copyright.txt`](./third-party/SCOWL-Copyright.txt). The generated migration includes 11,002 entries before merging with the existing list. Regenerate only when intentionally creating/updating an unapplied migration; never edit a migration that has already been deployed:

```sh
curl -fL https://downloads.sourceforge.net/wordlist/scowl-2020.12.07.tar.gz -o /tmp/scowl-2020.12.07.tar.gz
node scripts/generate-word-bank.mjs /tmp/scowl-2020.12.07.tar.gz
```

The generator verifies archive SHA-256 `5587667caa20c4891390c2d42dbb4d5c4c3f41bee77af1457ece3ba23fb859cc` before extracting data. No dictionary API receives secrets or guesses. The server is the authority for real-word membership; the downloaded browser list only supplies random-secret choices. Accepted guesses never have to follow earlier clues.

## Google accounts and bet history

**Google sign-in is disabled by default until configured.** Guest play and participant-only bet history work immediately. To enable cross-device accounts:

1. In Google Cloud, configure an OAuth consent screen and a **Web application** OAuth client. If the consent screen is in Testing, add your players as test users, or publish it before inviting the public.
2. Add your site's origin as an authorized JavaScript origin, for example `https://asmitakumar97-svg.github.io`. Add **Supabase's callback URL**, `https://YOUR_PROJECT.supabase.co/auth/v1/callback`, as the authorized redirect URI. Copy the exact callback from Supabase's Google provider screen.
3. Under Supabase **Authentication → Sign In / Providers → Google**, enable Google and enter the client ID and client secret **there only**. Never put the OAuth secret in source code, a `VITE_` variable, GitHub Pages, or chat.
4. Under Supabase **Authentication → URL Configuration**, set the Site URL to `https://asmitakumar97-svg.github.io/crack-the-code/` and allow that exact redirect URL. For development, also allow `http://localhost:5173/`.
5. Set the public build flag `VITE_GOOGLE_AUTH_ENABLED=true`. For GitHub Pages, add it under repository **Settings → Secrets and variables → Actions → Variables**, then redeploy the Pages workflow. For local Supabase-backed development, set it in `.env` and restart Vite. Leave it false until the provider and redirects work.
6. Open the player icon, choose **Sign in with Google**, and sign in **before** creating or joining a match. Complete a match, open the same Google account in a separate browser/device, and verify the saved bet and opponent appear. Check that an unrelated account cannot see it.

Signing in changes the player identity; guest matches/history are not merged into a Google account. Finish a match and return Home before switching accounts. The account panel blocks switching while a room is open. Signing out affects only the current device. Google's tokens stay managed by Supabase Auth; ledger rows contain only game participant IDs, display-name/bet snapshots, scores, mode and completion time. Rows are read-only to players under RLS and are not broadcast through Realtime.

The ledger records whole-match outcomes, not each round, and treats written bets as friendly commitments, not money transfers. Existing currently completed rooms are archived on migration; already-rematched historical bets cannot be recovered. Deleting a room or participant account deletes its ledger rows through foreign-key cascades.

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
- **Word rejected:** refresh old tabs, then enter a real six-letter English word. Guesses need not follow earlier clues. Validation runs on the server even if the random-secret dictionary is still loading. The expanded dictionary includes common plurals and US/UK spellings but may omit unusual terms; **Choose for me** can pick a recognized secret once its word list loads.
- **Clipboard unavailable:** manually share the room code, or use HTTPS.
