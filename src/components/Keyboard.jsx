import { BackspaceIcon } from './Icons.jsx';

const ROWS = [[...'qwertyuiop'], [' ', ...'asdfghjkl', ' '], ['enter', ...'zxcvbnm', 'back']];

export function Keyboard({ states = {}, onKey, disabled = false }) {
  return (
    <div className={disabled ? 'keyboard disabled' : 'keyboard'}>
      {ROWS.map((row, r) => (
        <div className="kb-row" key={r}>
          {row.map((k, i) =>
            k === ' ' ? (
              <div className="kb-spacer" key={`s${i}`} />
            ) : (
              <button
                key={k}
                type="button"
                className={k.length > 1 ? 'key wide' : 'key'}
                data-state={states[k]}
                aria-label={k === 'back' ? 'Backspace' : k}
                onClick={(e) => {
                  onKey(k);
                  e.currentTarget.blur();
                }}
              >
                {k === 'back' ? <BackspaceIcon /> : k === 'enter' ? 'Enter' : k}
              </button>
            ),
          )}
        </div>
      ))}
    </div>
  );
}
