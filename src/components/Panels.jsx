import { loadStats } from '../lib/storage.js';
import { usePrefs } from '../prefs.jsx';
import { Switch } from './Switch.jsx';

export function StatsPanel({ highlight = 0 }) {
  const s = loadStats();
  const pct = s.played ? Math.round((s.wins / s.played) * 100) : 0;
  const max = Math.max(1, ...s.dist);
  return (
    <div className="stats">
      <div className="stat-nums">
        {[[s.played, 'Played'], [pct, 'Win %'], [s.streak, 'Streak'], [s.best, 'Best streak']].map(([n, label]) => (
          <div key={label}>
            <b>{n}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <h3>Guess distribution</h3>
      <div className="dist">
        {s.dist.map((n, i) => (
          <div className="dist-row" key={i}>
            <span>{i + 1}</span>
            <div className={highlight === i + 1 ? 'bar hl' : 'bar'} style={{ width: `${Math.max(8, (n / max) * 100)}%` }}>
              {n}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExampleRow({ word, index, state }) {
  return (
    <div className="example">
      {[...word].map((c, i) => (
        <span key={i} className="tile" data-state={i === index ? state : undefined}>
          {c}
        </span>
      ))}
    </div>
  );
}

export function HelpPanel() {
  return (
    <div className="help">
      <p>Guess the 5-letter word in 6 tries. Each guess must be a real word, and the tiles change colour to show how close you were:</p>
      <ExampleRow word="crane" index={0} state="correct" />
      <p><b>C</b> is in the word and in the right spot.</p>
      <ExampleRow word="pilot" index={1} state="present" />
      <p><b>I</b> is in the word but in the wrong spot.</p>
      <ExampleRow word="vague" index={3} state="absent" />
      <p><b>U</b> is not in the word at all.</p>

      <h3>Game modes</h3>
      <ul>
        <li><b>Daily</b> — one word a day, the same for everyone. Compare results!</li>
        <li><b>Unlimited</b> — as many random words as you like.</li>
        <li><b>🤝 Co-op</b> — one shared board. Take turns (or not) and talk it out in chat.</li>
        <li><b>🏁 Race</b> — same word, separate boards. You see the colours on the other board but not the letters. First to solve it wins.</li>
        <li><b>🎯 Word Duel</b> — you each pick a word for the other to guess, and you can watch them work on yours. Fewest guesses wins.</li>
        <li><b>Challenge links</b> — pick a word and send a link. You don't need to be online at the same time.</li>
      </ul>

      <h3>Playing together</h3>
      <p>
        One of you taps “Create a room” and sends the invite link. Games and chat go straight between your two
        browsers. If someone refreshes or loses signal, the room reconnects by itself.
      </p>
      <p className="muted">Hard mode: any hints you've been shown must be used in later guesses.</p>
    </div>
  );
}

export function SettingsPanel() {
  const { prefs, update } = usePrefs();
  return (
    <div className="settings">
      <div className="setting">
        <span>
          <b>Hard mode</b>
          <small>For solo games; starts with your next word. Rooms have their own switch.</small>
        </span>
        <Switch checked={prefs.hard} onChange={(hard) => update({ hard })} />
      </div>
      <div className="setting">
        <span>
          <b>High contrast</b>
          <small>Orange and blue instead of green and yellow.</small>
        </span>
        <Switch checked={prefs.contrast} onChange={(contrast) => update({ contrast })} />
      </div>
      <div className="setting">
        <span>
          <b>Theme</b>
        </span>
        <div className="segmented">
          {['system', 'light', 'dark'].map((t) => (
            <button key={t} type="button" className={prefs.theme === t ? 'seg active' : 'seg'} onClick={() => update({ theme: t })}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
