import { useLayoutEffect, useRef, useState } from 'react';
import { CloseIcon } from './Icons.jsx';

const REACTIONS = ['👏', '😂', '🔥', '😱', '🤔', '💀', '❤️'];

export function Chat({ chat, me, open, onClose, onSend, conn }) {
  const [text, setText] = useState('');
  const logRef = useRef(null);
  const stickToBottom = useRef(true);

  useLayoutEffect(() => {
    const el = logRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [chat.length, open]);

  const onScroll = () => {
    const el = logRef.current;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const submit = (e) => {
    e.preventDefault();
    if (onSend(text)) setText('');
  };

  return (
    <aside className={open ? 'chat open' : 'chat'} aria-label="Chat">
      <div className="chat-head">
        <strong>Chat</strong>
        <span className="conn" data-state={conn.state}>
          {conn.label}
        </span>
        <button className="icon-btn chat-close" type="button" aria-label="Close chat" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div className="chat-log" ref={logRef} onScroll={onScroll} aria-live="polite">
        {chat.length === 0 && <div className="msg sys">Messages go straight between the two of you.</div>}
        {chat.map((m) =>
          m.sys ? (
            <div key={m.id} className="msg sys">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className={m.from === me ? 'msg me' : 'msg them'} data-p={m.from}>
              {m.from !== me && <span className="who">{m.name}</span>}
              <span className={m.react ? 'bubble big' : 'bubble'}>{m.text}</span>
            </div>
          ),
        )}
      </div>
      <div className="reactions">
        {REACTIONS.map((e) => (
          <button key={e} className="react" type="button" aria-label={`Send ${e}`} onClick={() => onSend(e, true)}>
            {e}
          </button>
        ))}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input
          type="text"
          maxLength={500}
          placeholder="Say something…"
          autoComplete="off"
          aria-label="Message"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn primary" type="submit">
          Send
        </button>
      </form>
    </aside>
  );
}
