import { BackIcon, HelpIcon, SettingsIcon, StatsIcon } from './Icons.jsx';

export function Header({ showBack, onBack, onPanel }) {
  return (
    <header className="topbar">
      <div className="topbar-side">
        {showBack && (
          <button className="icon-btn" type="button" aria-label="Back" onClick={onBack}>
            <BackIcon />
          </button>
        )}
      </div>
      <h1 className="logo">
        Wordle <em>Together</em>
      </h1>
      <div className="topbar-side right">
        <button className="icon-btn" type="button" aria-label="How to play" onClick={() => onPanel('help')}>
          <HelpIcon />
        </button>
        <button className="icon-btn" type="button" aria-label="Statistics" onClick={() => onPanel('stats')}>
          <StatsIcon />
        </button>
        <button className="icon-btn" type="button" aria-label="Settings" onClick={() => onPanel('settings')}>
          <SettingsIcon />
        </button>
      </div>
    </header>
  );
}
