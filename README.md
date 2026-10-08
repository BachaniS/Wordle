# Wordle Together

Wordle for two, built with React + Vite. It's a static site, so it runs on Netlify's free tier with no server or database.

## Modes

| Mode | How it works |
| --- | --- |
| **Daily** | One word per day, the same for everyone, so you can compare results. |
| **Unlimited** | A new random word whenever you want one. |
| **🤝 Co-op** | One shared board. Take turns or let anyone guess, and watch each other type live. |
| **🏁 Race** | Same word, separate boards. You see the colours on the other board but not the letters. First to solve it wins. |
| **🎯 Word Duel** | Each of you picks a secret word for the other, then you watch them guess yours. Fewest guesses wins. |
| **Challenge link** | Pick a word and send a link. The other person doesn't need to be online at the same time. |

Every room has a **chat** with emoji reactions, a running score, and optional hard mode. Solo games keep stats and a streak, and you can share results as emoji grids.

## Run it locally

Requires Node 20.19+ or 22.12+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for the game rules and room logic
```

To try multiplayer on one computer, open the app in a normal window and a private window. Create a room in one and join it from the other.

## Deploy to Netlify

**Option A: drag and drop (no account setup beyond Netlify)**

```bash
npm run build
```

Then drag the `dist/` folder onto <https://app.netlify.com/drop>.

**Option B: from GitHub (auto-deploys on every push)**

Push this folder to a GitHub repo, then in Netlify choose *Add new site → Import an existing project*. The build settings are already in `netlify.toml` (`npm run build`, publish `dist`).

## Playing together

1. One person taps **Create a room** and then **Copy invite link**, and sends the link.
2. The other person opens the link, enters a name, and taps **Join**.
3. Either of you picks a game. Scores and chat stay for as long as the room is open. If someone refreshes or briefly loses signal, the app reconnects on its own.

### How it works

The two browsers connect **directly** to each other over WebRTC using [PeerJS](https://peerjs.com/). PeerJS's free public server is only used to introduce the browsers to each other. Game moves and chat messages go straight between you and are not stored anywhere.

The person who creates the room is the referee. Their browser checks every guess and keeps the secret words, and it only sends a word to the other player once the round is over. Someone could still dig the words out with the browser's developer tools, so treat it as an honour system.

If the PeerJS matchmaking server is down, rooms can't connect, but solo play and challenge links still work.

## Project layout

```
src/
  lib/          plain-JS game logic (no React)
    wordle.js     scoring, hard mode, daily word, challenge links
    words.js      2,315 answers + 10,657 allowed guesses
    room.js       multiplayer rules (the referee's reducer)
    rooms.js      active room: connection, shared state, chat (external store)
    net.js        PeerJS connection with heartbeats + auto-reconnect
  screens/      Home, Solo, Room (lobby + chat), Match (a round in a room)
  components/   Board, Keyboard, Chat, Modal, panels, toasts
  hooks/        reveal animation timing, keyboard input, tile sizing
tests/          node:test unit tests
```
