# Wordle Together

Wordle for 2–4 players, built with React + Vite. It's a static site, so it runs on Netlify's free tier with no server or database.

## Modes

| Mode | How it works |
| --- | --- |
| **Daily** | One word per day, the same for everyone, so you can compare results. |
| **Unlimited** | A new random word whenever you want one. |
| **🤝 Co-op** | One shared board. Take turns round the table or let anyone guess, and watch each other type live. |
| **🏁 Race** | Same word, separate boards. You see the colours on everyone else's board but not the letters. First to solve it wins. |
| **🎯 Word Duel** | Everyone picks a secret word for the next player round the circle, then watches them guess it. Fewest guesses wins, and ties share the win. |
| **Challenge link** | Pick a word and send a link. The other person doesn't need to be online at the same time. |

Every room has a **chat** with emoji reactions, a running score, and optional hard mode. Solo games keep stats and a streak, and you can share results as emoji grids.

## Run it locally

Requires Node 20.19+ or 22.12+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for the game rules and room logic
```

To try multiplayer on one computer, create a room in one tab and join it from a few new tabs or private windows (up to 4 players). Open each as a new tab rather than duplicating one, because a duplicated tab copies the first tab's identity and takes over its seat.

## Deploy to Netlify

**Option A: drag and drop (no account setup beyond Netlify)**

```bash
npm run build
```

Then drag the `dist/` folder onto <https://app.netlify.com/drop>.

**Option B: from GitHub (auto-deploys on every push)**

Push this folder to a GitHub repo, then in Netlify choose *Add new site → Import an existing project*. The build settings are already in `netlify.toml` (`npm run build`, publish `dist`).

## Playing together

1. One person taps **Create a room** and then **Copy invite link**, and sends the link to up to three friends.
2. Each friend opens the link, enters a name, and taps **Join**. A fifth person is told the room is full.
3. Anyone picks a game, and it starts for everyone who's in the room. Scores and chat stay for as long as the room is open.

If someone refreshes or briefly loses signal, the app reconnects and they get their seat back. While they're away, co-op skips their turn. If they don't come back, the host can tap **×** by their name to free the seat. Someone who joins partway through a race or duel watches that round and plays from the next one. In co-op they join in straight away.

### How it works

Each guest's browser connects **directly** to the host's browser over WebRTC using [PeerJS](https://peerjs.com/). PeerJS's free public server is only used to introduce the browsers to each other. Game moves and chat messages travel between your browsers (guests' chat is passed along by the host's) and are not stored anywhere.

The person who creates the room is the referee. Their browser hands out seats, checks every guess, keeps the secret words, and only sends a word to the other players once the round is over. If the host leaves, the room closes for everyone. Someone could still dig the words out with the browser's developer tools, so treat it as an honour system.

If the PeerJS matchmaking server is down, rooms can't connect, but solo play and challenge links still work.

## Project layout

```
src/
  lib/          plain-JS game logic (no React)
    wordle.js     scoring, hard mode, daily word, challenge links
    words.js      2,315 answers + 10,657 allowed guesses
    room.js       multiplayer rules for 2–4 players (the referee's reducer, seats)
    rooms.js      active room: seats, shared state, chat relay (external store)
    net.js        PeerJS links (host ↔ each guest) with heartbeats + auto-reconnect
  screens/      Home, Solo, Room (lobby + chat), Match (a round in a room)
  components/   Board, Keyboard, Chat, Modal, panels, toasts
  hooks/        reveal animation timing, keyboard input, tile sizing
tests/          node:test unit tests
```
