# Duo Dash

An iOS-friendly game hub built with React, TypeScript, Tailwind CSS, Supabase Auth, PostgreSQL and Realtime. Play **Crack the Code**, **Memory Match**, **D8 Dots & Boxes**, **Ring Rush**, **Bingo**, **Cheat**, or **Hangman** in one shared room, or play every game solo.

**[Play Duo Dash online](https://asmitakumar97-svg.github.io/crack-the-code/)** — the existing URL and Google sign-in redirect stay unchanged.

## One room, more games

The home screen presents all seven games as equal-sized preview cards with matching headings, descriptions and actions. Cards use a two-column grid on larger screens and stack on phones; each opens the shared-room setup. The direct Crack the Code quick-start and solo buttons remain separate.

Choose **Create or join a Duo room**, enter your name, and invite your friend using the room link or code. The host selects a game and settings; both players must confirm the current settings before it starts. Any settings change clears both confirmations. The same two identities, room code and connection remain when switching games.

- **Memory Match:** choose **12, 16 or 24 tiles** (6, 8 or 12 pairs), then **paintings, florals, animals or patterns**. Both players share the same shuffled board. Flip two cards: a match scores one pair and earns another turn; a mismatch remains visible for 1.5 seconds before the next player can flip. Most pairs wins, with equal scores a draw. Reloading does not reset the board, score or turn.
- **Dots & Boxes, D8 edition:** choose **10×10, 12×12 or 15×15 dots**, giving 81, 121 or 196 boxes. The host takes the first turn. Roll the eight-sided dice once, then place that many horizontal/vertical lines between neighbouring dots. The fourth side claims a box for the player placing it; a shared edge can claim two boxes. Completing boxes does **not** grant a bonus roll or extra lines. After the rolled lines are used, the turn passes. A roll larger than the remaining empty edges is capped to those edges. Most boxes wins, with ties allowed. Both players see the server-selected roll, synchronized animation and each committed line; no hover/cursor preview is broadcast. Scroll and zoom the board on mobile, or focus a line and press Enter/Space. Reloading preserves the dice, unused lines, box owners and turn.
- **Crack the Code:** choose Number/Word Lock and Take turns/Live race in the shared lobby, then follow the existing secret and bet setup. Each new code match resets its current scores/bets, without deleting protected completed-match history. The direct **Crack the Code** quick-start and solo practice remain available on the home screen.
- **Ring Rush:** race on identical, guaranteed-solvable puzzles with **40 round beads, four colours (ten each), and five rods** of capacity ten. Four mixed full rods and one empty rod start each race. After a shared three-second countdown, lift one top bead and place it onto an empty rod or the same colour. First to sort four complete colour stacks wins, validated by the server. Both racers see live progress and move totals. **Restart my beads** restores only your own initial board without resetting the clock, cumulative moves or opponent. Reloading preserves progress. Colour letters and keyboard-accessible controls do not require distinguishing colours alone. Saved 20-ring races remain playable with their original five-per-rod capacity; only newly generated races use forty beads.
- **Bingo:** each player receives a different shuffled 5×5 board containing numbers 1–25. The host calls first; players alternate selecting an uncalled number. Each call automatically marks both boards. All five horizontal lines, five vertical lines and both diagonals count. First to **five completed lines** wins; if one call takes both players to five or more, it is a draw. Opponent layouts stay private; only their completed-line count is public. No manual marking or client-declared wins.
- **Cheat:** a standard 52-card deck, 26 cards each, with private hands and a face-down central pile. The host starts at Ace; claims cycle through 2–10, Jack, Queen, King and back to Ace. Play **1–4 owned cards** as the required rank, truthfully or as a bluff. The opponent must **Accept** or **Call bluff**. A caught liar picks up the whole pile; a wrong caller picks it up. Only the challenged play's card faces are revealed, with an animation. The responder leads the next rank. Emptying your hand does not win until the opponent accepts the last play or challenges a truthful last play. Accepts never reveal face-down cards.
- **Hangman:** both players privately lock a **3–12-letter A–Z word** and category (animals, food, places or nature), or request a category word. Custom words need not be in the built-in word bank. After both lock, the host guesses first and players **alternate one letter**, including after correct guesses. Letters reveal every occurrence. First to solve the other's word wins; six wrong distinct letters loses. Neither public state nor notifications reveal an opponent's word before the duel ends. Choose a new category or custom word for the next duel in the same room.
- Only the host can return to game selection after a board/card/word duel or full code match finishes. A code room with no locked secrets can return before play begins. Games cannot be abandoned by silently switching mid-match.
- Memory decks are server-private. Authorized state exposes only face-up, matched or completed-board cards. Server-validated session IDs and move numbers reject stale/double flips; room locks serialize concurrent actions. Browser clocks never decide a legal flip.
- Open-game and phone turn alerts work for Memory Match, Dots & Boxes, Bingo, Cheat and Hangman, with the same **Play your turn** message. Individual lines, dice rolls, earned Memory extra turns and a Cheat responder accepting/challenging before leading do not replay alerts. Ring Rush is simultaneous and sends no turn alerts.

### Player colours and friendly bets

Memory Match shows both player avatars and scores beside the board. The active character glows and is explicitly labelled, so colour is not the only turn indicator. Card backs show only the Duo Dash logo, with no visible numbers or letters; card numbers remain in screen-reader labels. Host flips and pairs are **mint**, player 2's are **amber**, in both themes and in solo/computer games. A mismatch keeps the flipping player's colour while the next player's avatar lights up. Server-stored ownership survives reloads and matches across sessions. Previously completed pairs from old saved games remain neutral because their individual owners were not recorded; new flips are coloured.

Hangman shows your own drawing beside the word puzzle, adding a head, body, two arms and two legs over six wrong guesses. Correct guesses add nothing; each player's drawing follows their own server-validated mistakes and survives reloads. The secret-word input is visible while you type on your own device, without autocomplete or spellcheck; it is never shown to the opponent before the duel finishes.

Every game indicates the active player beside their character with a glow and a written action label. Memory, Dots, Bingo, Cheat and Hangman follow the server's current turn, including choosing Hangman words and responding to a bluff. Crack the Code distinguishes the guesser from the player giving clues; simultaneous code races and Ring Rush highlight both participants. Finished games stop highlighting turns. Solo games use the same indicators, including the computer character, while solo Crack the Code highlights only you.

Bingo displays a separate **B I N G O** tracker for **each player**, visible to both opponents. Each completed line crosses out the next letter, up to all five. Both trackers update from public server-validated line totals without revealing the other player's board. A completed game displays **BINGO!**, including a shared finish when both reach five lines on the same call.

All seven **two-player games** support optional friendly challenges/forfeits, not payments. For board/card/word duels, each player can save up to 120 characters describing what happens if they win, or leave their bet empty. Both review the saved bets before confirming. Changing settings or either saved bet clears both confirmations; stale saves/confirmations are rejected. Bets lock at the start, the winner's agreed bet appears at completion, and completed results (including no-bet games and draws) enter participant-only history. Draws award no bet. A new game clears both proposals, never old history. In Crack the Code, bets remain after secret entry; **Play without a bet** explicitly saves that choice before the usual agreement step. Solo games have no bets and do not enter two-player bet history.

### Refreshing a saved phone name and icon

New iPhone installations use the **Duo Dash** manifest name, explicit Apple web-app title and Duo icon. If an existing Home Screen app still shows the old branding, first open the current live site and close/reopen the app. If it remains stale, remove the old Home Screen app, open the live URL in **Safari**, then choose **Share → Add to Home Screen** and name it **Duo Dash**. Re-enable phone notifications in the new installation if needed. Removal can clear the installed app's guest identity: guest history is browser-specific and is **not merged** by later Google sign-in. Existing signed-in history remains attached to that same account. On Android, use Chrome's **Add to Home screen / Install app** after removing the old shortcut if it does not update.

## Every game, solo

Choose **Play solo**, then a game. No room, display name, second browser or Google account is needed.

- **Crack the Code:** the existing six-guess or three-minute Number/Word Lock puzzles, with automatic clues.
- **Memory Match:** compete against the computer with 12, 16 or 24 tiles and any picture theme. **Easy** remembers the most recent 4 revealed cards, **Medium** remembers 8, and **Hard** remembers all revealed cards. It can use remembered pairs, but never reads face-down card values to choose a move. Matches earn another turn, just as in multiplayer.
- **Dots & Boxes:** compete against the computer with 10, 12 or 15 dots per side and the same D8 rules. **Easy** chooses an available line randomly. **Medium** prioritizes claiming boxes. **Hard** additionally avoids creating a third side that gives away an easy box. All levels use the same server-selected 1–8 dice and receive no bonus rolls.
- **Ring Rush:** race the computer on the same solvable puzzle. **Easy** makes one legal move every 2.4 seconds, **Medium** every 1.5 seconds, and **Hard** every 0.9 seconds. The computer follows a verified solution; it cannot skip beads, overfill rods or make illegal colour moves. **Unlike turn-based games, this race's clock and computer keep going while you are away.** Returning or submitting a move first catches up all due computer actions, with the actual scheduled finish time deciding a late loss. Restarting only your beads never delays the computer.

Memory Match and Dots & Boxes computer turns animate one action at a time, using server deadlines. They advance through authenticated polling while the game is open, not through a background job. Closing or leaving saves those boards; returning resumes them without fast-forwarding unseen moves. Reloads preserve scores, remaining lines, rolls and the computer's limited memory. Ring Rush uses elapsed-time catch-up instead. Starting a new computer match explicitly replaces that player's unfinished computer match; existing Crack the Code puzzles are separate. Solo computer matches do not send turn notifications or create multiplayer rooms/bot accounts.

Migration fifteen keeps solo boards, decks and computer memory in a private RLS-enabled table. Migration nineteen adds the three new games using the same owner-only storage and shared transitions. Memory tiles show **pictures only**: artwork titles remain in screen-reader labels and optional credits, never as visible face-up captions. Failed pictures show an error icon and an explicit reload message.

The three new games also have Easy/Medium/Hard computers:
- **Bingo:** Easy calls randomly. Medium scores promising lines; Hard puts more weight on near-complete lines. It uses only its own layout and public called numbers.
- **Cheat:** plays matching cards from its own hand when possible, otherwise bluffs. Higher levels challenge more often; all levels challenge claims impossible given their own cards. It never inspects the opponent's hand or face-down play when deciding.
- **Hangman:** Easy guesses random unused letters and sets shorter words; Medium uses letter frequency; Hard filters category words using only the public pattern and guessed letters. Custom words outside the word bank use the same legal common-letter ordering when no candidate remains. Computer secret lengths scale with difficulty, but no difficulty sees the human secret to choose letters.

These turn-based computers take one action per server deadline and pause while closed, like Memory and Dots. Null-ID saved-game discovery is read-only. They use no bot Auth accounts or multiplayer rooms.

### Memory picture licensing

The 48 local theme images are CC0 artworks downloaded from [The Cleveland Museum of Art Open Access API](https://openaccess-api.clevelandart.org/). Each source, title, museum ID and license is recorded in [`memory-images.json`](./src/lib/memory-images.json), with clickable credits in the game. Resized images live in [`public/memory`](./public/memory/). No third-party image request is needed during play. [`scripts/memory-assets.mjs`](./scripts/memory-assets.mjs) regenerates the catalog on macOS using `sips`, accepts only CC0 records and fails if a theme cannot supply twelve distinct artworks. The images are museum art depicting each theme, not stock animal/floral photographs.

### Upgrade an existing installation to Duo Dash

After migrations one through twelve, apply migrations **thirteen through twenty-two** once in order in the **same Supabase project**, before publishing the frontend. Thirteen adds private Memory Match data and shared rooms; fourteen adds Dots & Boxes; fifteen adds solo computers; sixteen makes discovery read-only; seventeen adds Ring Rush; [`eighteen`](./supabase/migrations/202610250018_bead_sort.sql) upgrades new races to forty beads without changing saved races; [`nineteen`](./supabase/migrations/202610250019_party_games.sql) adds Bingo, Cheat and Hangman; [`twenty`](./supabase/migrations/202610250020_memory_colours.sql) records Memory tile ownership; [`twenty-one`](./supabase/migrations/202610250021_duo_bets.sql) adds optional agreed bets and completed history for every shared game; [`twenty-two`](./supabase/migrations/202610250022_party_turn_fixes.sql) fixes bluff-pile pickup, hard Hangman word filtering and turn-alert deduplication without rewriting already-applied migration nineteen. An installation already on **seventeen needs only eighteen through twenty-two**, in order. They preserve existing matches, identities, bets/history and solo puzzles. Existing in-progress board games finish without retroactive bets; bets begin with the next confirmed game. Keep only `rooms` in Realtime; never publish private game tables, hands, words, bets or consent data. New installations apply all twenty-two migrations in order.

If you are unsure whether thirteen was applied, run `select to_regclass('private.duo_choices') is not null as duo_dash_installed;` in the SQL Editor. If it returns `false`, run thirteen before fourteen. Do not rerun thirteen when it returns `true`; migrations are not intended to be reapplied.

Dots & Boxes uses membership-authorized, row-locked RPCs for rolls and lines. Clients cannot select a dice result, draw during the server's 2.4-second roll window, reuse an edge, exceed their line budget, play out of turn or replay a stale session/move. Realtime room-version updates publish each committed action; one-second polling provides a fallback for this game if Realtime is unavailable.

Ring Rush also uses membership-authorized, row-locked RPCs and per-player action counters, so independent racer moves never invalidate the other player's action. The server rejects early, stale, illegal and completed-race moves; simultaneous finishes serialize into one winner. Puzzle solutions and reset templates remain private. Puzzles are generated backwards from a solved board using reversible legal moves, rather than arbitrary potentially-unsolvable shuffles. Shared lobbies and races use one-second polling if Realtime is unavailable.

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
3. Each player first chooses a six-digit code or six-letter word, or taps **Choose for me**, then **Lock my secret**. Locking successfully opens **The bets** automatically. Write and save both bets, then each chooses **Agree to bets**.
4. **Start game** appears on the host's **bets screen** once both players have agreed and locked secrets. Both see the countdown and can play. Local updates arrive every second.

Rooms, player identities and locked secrets survive a server restart in the ignored `.local-game/` directory. Unsubmitted drafts are still browser-only and clear on reload. Local sessions last 30 days. If you deliberately reset the database or a session expires, use a fresh private window or clear this site's browser storage to create a new player. Never commit or upload `.local-game/`: it contains private game data. Keep using the same browser profile and address to recover your player.

For an iPhone/iPad on the **same Wi-Fi**, keep the Mac server running and open Vite's printed **Network** URL in Safari. `localhost` on the phone refers to the phone, not this Mac. Allow the local-network connection if macOS prompts. The server must stay running for both players.

Local play is a development server for this Mac/local network, **not public internet hosting**. Do not expose it through port forwarding or an internet tunnel. The local API uses unguessable server-verified session tokens, authorized RPCs, same-origin checks and signup throttling, but it is not a replacement for hosted Supabase's production Auth, TLS and operational controls. **GitHub Pages cannot run this local server.**

For public hosting, follow the Supabase setup below and use `npm run dev`/`npm run build`. Production builds never enable the local backend, even if the build mode is named `local-play`; secrets and the database are never bundled into the website.

## Current rules

- **Number Lock:** six digits, including leading zeros and repeats.
- **Word Lock:** real **six-letter words**, checked by the server against an expanded English dictionary of over 11,000 words, including common inflections and American/British spellings. `NORMAL`, `APPLES` and `FRUITS` are accepted. Any valid word may be tried, even if it contradicts previous green/yellow clues: this is not a forced-clue or hard mode. The browser checks length/characters only, so a loading, stale or unavailable local dictionary cannot wrongly reject a valid word; the server still rejects made-up entries such as `XXXXXX`. There is no visible word-bank button or list.
- **Solo play:** choose **Play solo**, Number Lock or Word Lock, then either **6 guesses** with no timer or a **3-minute timer** with unlimited guesses. No display name, room, opponent or bet is required. Feedback is automatic; answers stay on the server until the puzzle ends. Leaving/reloading does not pause or reset a timed puzzle.
- **Wordle-style clues in both modes:** green/mint means the correct digit or letter in the correct position; yellow means a matching item in the wrong position; grey/slate means no unused matching copy remains. Exact positions are reserved first, then remaining copies are allocated left to right. A grey extra copy does not mean that character is entirely absent.
- Only the **exact secret in the exact order** wins. All-yellow tiles do not count as a solve. Keyboard keys stay yellow while any known matching copy still needs a green position.
- Four screens replace the long landing page: **Name → How to play → Room & secret → Play**.
- On **screen 3 → Room → My secret**, each player writes their secret using six number tiles or six letter tiles and the virtual keyboard, then chooses **Lock my secret**. Word keys have at least 58px height and larger labels, including on small phones. **Choose for me** fills a random six-digit code or real six-letter word using the browser's cryptographic random generator. Players can edit or choose again before locking. It never submits automatically, and unlocked drafts stay in that browser only. The internal dictionary still validates words and supplies random secrets, but is not shown as a browsable list. These game secrets are not passwords; never reuse a real password.
- In **multiplayer**, your own secret is **always visible on your screen** while typing and after locking. A **Your code / Your word** card stays visible during the countdown and gameplay, including while marking hints or waiting for a turn. There is no Show/Hide step. This uses only your authorized `own_secret`; it does not reveal the opponent's answer. Solo targets are different: they stay hidden until the puzzle ends. Be mindful of people looking at your screen or screen sharing.
- Setup is **Secret → Bets → Agree → Play**. Both players choose and lock their secrets before accessing bets. A successful lock opens **The bets** automatically; failed validation stays on secret entry. Bet editing, review, agreement and **Start game / Start round** live only on the bets screen. Only the host can start, once both secrets are locked and both players have agreed. The server enforces the same requirements. Reloading a locked secret returns to Bets, with your own secret still visible. Both see a shared six-second countdown.
- **Live race:** both players guess simultaneously; a visible timer tracks elapsed time only.
- **Take turns:** exactly one guess each, alternating without a turn limit. The secret owner taps matching tiles in the submitted guess; each tap automatically chooses green for an exact position or yellow for a remaining matching copy. Tap again to deselect. Non-matches stay grey, and tapping one explains that no unused match remains. **Check & send hints** highlights missed matching tiles and names their positions, without sending incomplete clues or advancing the turn. Colours use only the owner's authorized secret and reserve exact copies before allocating yellow copies left to right, regardless of tap order. The server independently verifies all hints before publishing them. There is no elapsed timer on this screen. The opening player swaps each round. The first correct answer ends the round immediately; there is no extra reply guess after a solve.
- The **first exact solve accepted by the server wins the round immediately**, even if that player used more guesses. Guessing stops for both players and both secrets are revealed. Room locks serialize close finishes into one winner; late guesses cannot change the result. Both players choose **Ready for round N** before setting new secrets, then the host explicitly starts. Bet agreements carry across rounds and reset on a new match or a changed bet. There is no automatic next-round timer.
- **Unlimited guesses** in both modes. Attempt counts remain visible, without a maximum. There is no automatic draw after eight guesses.
- Best of three: a player reaching two wins ends the match early. Otherwise the match ends after three rounds. A tied final score draws, with no bet won.
- **No time limit** and no automatic room expiry. Elapsed time is recorded but never determines the winner. Disconnected players can return with the same browser identity.
- **Pastel / Dark themes:** choose in the header. Pastel is the default; the preference is saved on that browser and survives reloads. Green/yellow/grey meanings and clue symbols stay the same in both themes.
- **Readable branding and player avatars:** Duo Dash uses an original mint-and-amber paired-card logo and clearly spaced, title-case wordmark in both themes. Google players see their profile photo in the header/account and share it with their opponent inside a private room. Guests and players without a usable photo get a stable robot, cat, fox or owl character, based on their player identity. No avatar service receives player IDs.
- **Welcome screen:** the game opens with the **Duo Dash** title and a primary **Create or join a Duo room** action, plus Crack the Code friend-play and solo shortcuts. Name entry appears after choosing shared-room or friend play. The selected flow is kept in the page's `play` query parameter so reloads resume that flow; returning Home clears it. Shared-room invitations open Duo setup, legacy invitations still open friend setup, and saved rooms reconnect automatically.
- **Turn alerts:** in Take turns, opt into sound and browser notifications for incoming moves while the game remains open. Server-backed phone push (including while using another app) is also implemented, but stays disabled until its one-time setup is completed. On iPhone it requires the installed Home Screen app and iOS 16.4+. See [turn notifications and phone setup](./docs/turn-notifications.md).
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
3. Open **SQL Editor** and run all twenty-two migrations **in this order**:
   - [`202610160001_game.sql`](./supabase/migrations/202610160001_game.sql)
   - [`202610160002_race_bets.sql`](./supabase/migrations/202610160002_race_bets.sql)
   - [`202610160003_host_turns.sql`](./supabase/migrations/202610160003_host_turns.sql)
   - [`202610160004_wordle_feedback.sql`](./supabase/migrations/202610160004_wordle_feedback.sql)
   - [`202610160005_six_letter_unlimited.sql`](./supabase/migrations/202610160005_six_letter_unlimited.sql)
   - [`202610160006_code_first_setup.sql`](./supabase/migrations/202610160006_code_first_setup.sql)
   - [`202610160007_expanded_dictionary.sql`](./supabase/migrations/202610160007_expanded_dictionary.sql)
   - [`202610160008_bet_history.sql`](./supabase/migrations/202610160008_bet_history.sql)
   - [`202610160009_solo.sql`](./supabase/migrations/202610160009_solo.sql)
   - [`202610160010_player_avatars.sql`](./supabase/migrations/202610160010_player_avatars.sql)
   - [`202610170011_turn_notifications.sql`](./supabase/migrations/202610170011_turn_notifications.sql)
   - [`202610170012_six_digit_numbers.sql`](./supabase/migrations/202610170012_six_digit_numbers.sql)
   - [`202610250013_duo_dash.sql`](./supabase/migrations/202610250013_duo_dash.sql)
   - [`202610250014_dots_and_boxes.sql`](./supabase/migrations/202610250014_dots_and_boxes.sql)
   - [`202610250015_solo_computer.sql`](./supabase/migrations/202610250015_solo_computer.sql)
   - [`202610250016_solo_discovery.sql`](./supabase/migrations/202610250016_solo_discovery.sql)
   - [`202610250017_ring_rush.sql`](./supabase/migrations/202610250017_ring_rush.sql)
   - [`202610250018_bead_sort.sql`](./supabase/migrations/202610250018_bead_sort.sql)
   - [`202610250019_party_games.sql`](./supabase/migrations/202610250019_party_games.sql)
   - [`202610250020_memory_colours.sql`](./supabase/migrations/202610250020_memory_colours.sql)
   - [`202610250021_duo_bets.sql`](./supabase/migrations/202610250021_duo_bets.sql)
   - [`202610250022_party_turn_fixes.sql`](./supabase/migrations/202610250022_party_turn_fixes.sql)

   For phone push, also complete the [notification setup](./docs/turn-notifications.md). Open-game turn alerts do not require the phone delivery backend. Keep `VITE_PHONE_PUSH_ENABLED=false` until that backend is configured.
4. Only run migrations you have not applied yet, each as one complete query, up to twenty-two. An installation on seventeen needs **eighteen through twenty-two**; on nineteen, **twenty through twenty-two**. Earlier installations apply their remaining migrations in order. Apply the database updates before deploying the frontend, then refresh the game pages.
   **Migration twelve changes Number Lock to six digits in multiplayer and solo.** Unfinished number rounds return to secret entry: their current guesses and secrets are cleared, but match/round numbers, scores, bets and completed results remain. Unfinished solo number puzzles restart with a fresh six-digit answer, no guesses and a fresh three-minute deadline when timed. Completed four-digit rounds, solo puzzles and bet history remain readable; Word Lock is unchanged.
   Earlier upgrades: migrations two and three restart matches. Four recalculates duplicate-safe clues. Five restarts legacy four-letter Word Lock matches with bets retained and introduces six-letter words and unlimited guesses. Six implements code-first setup; seven expands the dictionary; eight adds immutable completed-match bet history; nine adds private solo puzzles and the 761 common random-answer words; ten adds participant-only Google photos; eleven adds private phone notification subscriptions and delivery jobs. Do not add `bet_history`, solo data or auth/profile data to Realtime publications.
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
4. Player A privately locks `112256`; player B locks `334456`. Before locking, Bets is disabled. Each successful lock opens **The bets** automatically; invalid entries must not advance. Your own secret remains visible on this screen.
5. Both write their bets (for example “You make me a coffee” / “You bring me a snack”), select **Save bet**, then **Agree to bets**, staying on this screen. **Start game** appears only on A's bets screen after both are ready. B never gets Start; the secret screen never shows bet controls or Start. The host starts; neither can guess before the countdown completes. In Live race both now guess simultaneously, with elapsed time visible.
6. A guesses `333333`: exactly the **first two tiles are green**, the remaining four are grey. The two correctly positioned copies consume both `3`s in the secret.
7. A guesses `445633`: all six tiles are yellow, and the round continues because every item is in the wrong position.
8. A guesses `334456` first: the round ends immediately in both windows, A gets one point, and the winner screen reveals both secrets. B cannot submit a later winning guess.
9. A selects **Ready for round 2**; both stay on the reveal screen until B also chooses it. Lock new secrets and let the host start; no repeated bet agreement is needed. Try B winning round two, then A winning round three: A wins the match, and A's written bet appears. Alternatively A wins rounds one and two: no third round is needed.
10. Both choose **New match · new bets**. Scores reset and the bet fields are blank. Both must write and agree again.
11. Reload either browser while guessing: accepted guesses, scores and your locked secret recover. Unsubmitted guesses, unsubmitted secrets and unsaved bet edits deliberately remain private and disappear on reload.
12. Try Word Lock with A's `LETTER` and B's `SECRET`. A guesses `STREET`: green/grey/yellow/yellow/green/green. The correctly positioned final `T` consumes that copy, so the extra `T` is grey. `XXXXXX` is rejected. There is no word-bank list; **Choose for me** is available only for picking a secret. Check six tiles throughout entry, own-secret cards, history, manual hints and reveals.
13. Submit at least ten wrong race guesses; play must continue with the timer running. In **Take turns**, alternate at least ten guesses each: no timer, no extra consecutive guesses, no automatic draw. Continue until one player solves.

Keyboard colours use only your published clues: a digit or letter stays yellow while any known matching copy still lacks a green position. Green positions accumulate across guesses without double-counting the same position. A later guess can uncover another copy and turn the key yellow again; undiscovered copies are not revealed. Guess-history tiles retain normal positional feedback.

### Manual hints and anti-cheating

1. Start a Take turns room with A's secret `112256` and B's secret `334456`.
2. A opens round one and guesses `333333`. The guess leaves A's field and B sees a manual clue screen. A sees **no feedback yet** and cannot submit another guess.
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

Unit/integration tests run **all twenty-two actual migrations** in embedded PostgreSQL (PGlite), with test-only auth/roles. Coverage includes:
- Duplicate-safe client/server feedback against an independent 6,561-case oracle, dictionaries, best-of-three matches, exactly six solo guesses and fixed timed deadlines.
- Participant-only immutable history, search/cursor pagination, optional no-bet play, revision-bound betting consent and the correct frozen winner's bet for both players in all six shared board/card/word games.
- Private Memory decks, all tile sizes, timed mismatches, persisted host/guest/computer flip and pair colours, neutral legacy pairs, scoring, replay/concurrency guards and same-room switching.
- All Dots sizes, server D8 rolls, deadlines, line budgets, single/double box claims, no bonus rolls, final-roll caps and full-board winners/ties.
- Bingo's independent layouts and all twelve lines; same-call draws; Cheat's private hands, bluff penalties, final challenges and all 52-card conservation; Hangman's repeated letters, six misses, custom/category words, privacy and complete solo wins at all levels.
- Owner-only solo storage, observed-information-only computers, all difficulties, deadlines, replacement, read-only discovery and reload recovery.
- Approved Google photos, private push subscriptions, authorized queues, retries, stale jobs, encrypted payloads and incoming-turn deduplication, including a Cheat responder's continuation.

Chromium/WebKit tests cover the **seven-game picker**, equal-sized homepage previews, mobile turn avatars/colours, betting changes and history, shared completion, computer actions, saved boards, both themes, keyboard controls and 320–1280px layouts. Local tests use real authenticated HTTP RPCs for the new games and shared bets. `npm run test:push` separately enables phone push against the real SQL/test transport to check opt-in, restore, disable and denied permissions; physical delivery still requires the [server setup and two-device check](./docs/turn-notifications.md). Cross-device history uses isolated sessions sharing one identity in tests; real Google login requires provider setup below.

Ring tests independently solve 100 generated puzzles, checking exactly **40 beads, ten of each colour, five rods of capacity ten**, plus legacy 20-ring compatibility. They verify complete legal solutions, early/illegal/stale move rejection, independent action counters, single-winner concurrent finishes, private projections, personal restarts, complete human/computer races at every pace and precise late-return catch-up. Chromium/WebKit tests cover the shared countdown, live progress, keyboard selection, personal resets, reloads, both winners, replay, same-room switching, both themes, 320–1280px layouts and real local HTTP RPCs.

Browser tests use two isolated contexts connected to those same real SQL functions through a **test-only transport**. WebSockets are disabled to verify polling recovery. This is not a replacement for testing a real hosted Supabase project: follow the two-person checklist to verify hosted Auth, PostgREST and Realtime.

`npm run test:local` separately starts the real local HTTP server with an ephemeral in-memory database and drives mobile Chromium/WebKit and desktop browsers without intercepting any backend requests. HTTP tests cover private secrets, authentication/identity isolation, origin/argument checks and persistence across a disk-backed server restart.

## Solo play

1. Choose **Play solo** on the home screen. Select six-digit Number Lock or six-letter Word Lock.
2. Choose **6 guesses** (no time limit) or **3-minute timer** (unlimited guesses), then **Start solo puzzle**.
3. Enter guesses using the virtual or physical keyboard. Green is exact, yellow is a remaining matching copy elsewhere, and grey has no unused match. Previous clues never restrict what you may try. Invalid words do not consume a guess.
4. Win with the exact answer. The sixth wrong guess, or expiry of the fixed timer, ends the puzzle and reveals the answer. **Play again** starts a new random puzzle; **Change solo challenge** returns to setup.
5. **Back to home** returns to the welcome screen and leaves the puzzle saved. Choose **Play solo** again to resume; a timed puzzle keeps running while away. Reloading during solo restores guesses and the original deadline. Friend invitation links always open multiplayer even if solo was previously selected.

The server stores solo targets and checked guesses in `private.solo_games`, with no direct client table access. Authenticated RPCs lock and authorize each puzzle, verify dictionary membership and duplicates, enforce six accepted guesses or a fixed 180-second deadline, reject stale/late guesses, and reveal the answer only after completion. One puzzle is active per player; starting another marks the previous puzzle abandoned. Active puzzles can also resume from another session with the same signed-in identity. Solo results do not create bets or multiplayer scores.

Random word answers and **Choose for me** use the original 761 common six-letter words; guesses may use the complete expanded dictionary. This keeps random puzzles approachable without rejecting meaningful guesses. Random number answers include leading zeros and duplicates.

## English dictionary

The expanded word list is generated from [SCOWL 2020.12.07](https://wordlist.aspell.net/), combining English, American, British (`-ise` and `-ize`), Canadian and Australian `words` lists and level-one spelling variants through size 70. It keeps only lowercase ASCII six-letter entries, converts them to uppercase, and retains all previously accepted words. Proper-name lists, abbreviations, apostrophes and accented/hyphenated entries are not imported. This is a broad offline dictionary, not a guarantee of every technical term or newly coined word.

The permitted redistribution terms and source credits are included verbatim in [`third-party/SCOWL-Copyright.txt`](./third-party/SCOWL-Copyright.txt). The generated migration includes 11,002 entries before merging with the existing list. Regenerate only when intentionally creating/updating an unapplied migration; never edit a migration that has already been deployed:

```sh
curl -fL https://downloads.sourceforge.net/wordlist/scowl-2020.12.07.tar.gz -o /tmp/scowl-2020.12.07.tar.gz
node scripts/generate-word-bank.mjs /tmp/scowl-2020.12.07.tar.gz
```

The generator verifies archive SHA-256 `5587667caa20c4891390c2d42dbb4d5c4c3f41bee77af1457ece3ba23fb859cc` before extracting data. No third-party dictionary API receives secrets or guesses. The server is the authority for real-word membership; the browser downloads only the common random-answer list. Accepted guesses never have to follow earlier clues.

## Google accounts and bet history

**Google sign-in is disabled by default until configured.** Guest play and participant-only bet history work immediately. To enable cross-device accounts:

1. In Google Cloud, configure an OAuth consent screen and a **Web application** OAuth client. If the consent screen is in Testing, add your players as test users, or publish it before inviting the public.
2. Add your site's origin as an authorized JavaScript origin, for example `https://asmitakumar97-svg.github.io`. Add **Supabase's callback URL**, `https://YOUR_PROJECT.supabase.co/auth/v1/callback`, as the authorized redirect URI. Copy the exact callback from Supabase's Google provider screen.
3. Under Supabase **Authentication → Sign In / Providers → Google**, enable Google and enter the client ID and client secret **there only**. Never put the OAuth secret in source code, a `VITE_` variable, GitHub Pages, or chat.
4. Under Supabase **Authentication → URL Configuration**, set the Site URL to `https://asmitakumar97-svg.github.io/crack-the-code/` and allow that exact redirect URL. For development, also allow `http://localhost:5173/`.
5. Set the public build flag `VITE_GOOGLE_AUTH_ENABLED=true`. For GitHub Pages, add it under repository **Settings → Secrets and variables → Actions → Variables**, then redeploy the Pages workflow. For local Supabase-backed development, set it in `.env` and restart Vite. Leave it false until the provider and redirects work.
6. Open the player icon, choose **Sign in with Google**, and sign in **before** creating or joining a match. Complete a match, open the same Google account in a separate browser/device, and verify the saved bet and opponent appear. Check that an unrelated account cannot see it.

Signing in changes the player identity; guest matches/history are not merged into a Google account. Finish a match and return Home before switching accounts. The account panel blocks switching while a room is open. Signing out affects only the current device. Google's tokens stay managed by Supabase Auth; ledger rows contain only game participant IDs, display-name/bet snapshots, scores, mode and completion time. Rows are read-only to players under RLS and are not broadcast through Realtime.

Google photos are read from the signed-in profile for the header/account. The authorized `get_game_state` RPC also provides each participant's current photo to the other room member. Only HTTPS `googleusercontent.com` photo URLs from non-anonymous Google identities are accepted; email addresses, Google profile names, tokens and other account metadata are never added to room state. The private photo helper cannot be called by clients, and outsiders cannot read a room's photo URLs. Photos are not copied into bet history, stored in browser preferences, or published through Realtime. Missing or failed photos show a locally generated, deterministic character instead; a failed image announces the fallback to assistive technology. The image request uses `referrerPolicy="no-referrer"`.

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
