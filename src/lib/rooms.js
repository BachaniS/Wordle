// The active two-player room, exposed as an external store for React
// (subscribe / getSnapshot, used through useSyncExternalStore).
//
// The host's browser is the referee: it runs `reduce` from room.js for both players,
// keeps the secret words, and broadcasts the shared state to the guest after every change.
import { Link } from './net.js';
import { newRoom, reduce, cleanName } from './room.js';
import { randomAnswer } from './wordle.js';
import { session as store } from './storage.js';

export const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const makeCode = () => randomAnswer().toUpperCase() + String(Math.floor(Math.random() * 90) + 10);
const chatKey = (code) => `wt-chat-${code}`;
const GUEST_FORBIDDEN = new Set(['hello', 'presence']);

class RoomSession {
  constructor({ role, code, name, host = null, fresh = false }, { onChange, onClosed }) {
    Object.assign(this, { role, code, name, host, fresh, onChange, onClosed });
    this.status = 'connecting';
    this.error = '';
    this.listeners = {};
    if (host) host.state.players.A = { name, online: true };
    this.state = host ? structuredClone(host.state) : null;
    this.chat = store.get(chatKey(code), []);
    this.chatSeq = this.chat.reduce((max, m) => Math.max(max, m.id || 0), 0);
    const pick = store.get('wt-mypick', null);
    this.myPick = pick?.code === code ? pick : null;
    this.persist();
    this.publish(false);
    this.connect();
  }

  // ---------------- API for the UI ----------------

  /** Subscribe to 'error' (an action was rejected) or 'chat' (incoming message). */
  on(type, fn) {
    (this.listeners[type] ||= new Set()).add(fn);
    return () => this.listeners[type]?.delete(fn);
  }

  act(action) {
    if (this.role === 'A') return this.dispatch(action, 'A');
    if (!this.link?.send({ t: 'act', a: action }) && action.type !== 'draft') {
      this.emit('error', 'Not connected — hang on a sec…');
    }
  }

  /** Duel: lock in the word the other player has to guess. */
  pickWord(word) {
    this.myPick = { code: this.code, gameId: this.state?.game?.id, word };
    store.set('wt-mypick', this.myPick);
    this.publish();
    this.act({ type: 'pick', word });
  }

  sendChat(text, react = false) {
    text = String(text).trim().slice(0, 500);
    if (!text) return false;
    const ts = Date.now();
    if (!this.link?.send({ t: 'chat', name: this.name, text, react, ts })) return false;
    this.addChat({ from: this.role, name: this.name, text, react, ts });
    this.publish();
    return true;
  }

  leave() {
    this.link?.send({ t: 'bye' });
    this.dispose();
    for (const k of ['wt-session', 'wt-host', 'wt-mypick', chatKey(this.code)]) store.del(k);
  }

  dispose() {
    const link = this.link;
    this.link = null;
    this.listeners = {};
    if (link) setTimeout(() => link.close(), 300); // give a final 'bye' time to go out
  }

  // ---------------- internals ----------------

  emit(type, payload) {
    this.listeners[type]?.forEach((fn) => fn(payload));
  }

  publish(notify = true) {
    const { role, code, status, error, state, chat, myPick } = this;
    this.snapshot = { role, code, status, error, state, chat, myPick };
    if (notify) this.onChange();
  }

  persist() {
    store.set('wt-session', { role: this.role, code: this.code });
    if (this.host) store.set('wt-host', this.host);
  }

  connect() {
    const link = new Link({
      onStatus: (s) => link === this.link && this.onStatus(s),
      onError: (msg) => {
        if (link !== this.link) return;
        this.error = msg;
        this.publish();
      },
      onOpen: () => {
        if (link === this.link && this.role === 'B') link.send({ t: 'hello', name: this.name });
      },
      onLost: () => {
        if (link !== this.link) return;
        if (this.role === 'A') this.dispatch({ type: 'presence', online: false }, 'B');
        else this.publish();
      },
      onMessage: (m) => link === this.link && this.onMessage(m),
    });
    this.link = link;
    if (this.role === 'A') link.host(this.code, this.fresh ? 0 : 6);
    else link.join(this.code);
  }

  onStatus(s) {
    this.status = s;
    if (s === 'taken' && this.fresh) {
      // Someone already has this code; quietly pick another one.
      this.code = makeCode();
      this.persist();
      this.link.host(this.code, 0);
    }
    if (s === 'waiting' || s === 'connected') this.fresh = false;
    this.publish();
  }

  onMessage(m) {
    if (this.role === 'A') {
      if (m.t === 'hello') this.dispatch({ type: 'hello', name: m.name }, 'B');
      else if (m.t === 'act' && typeof m.a?.type === 'string' && !GUEST_FORBIDDEN.has(m.a.type)) this.dispatch(m.a, 'B');
      else if (m.t === 'chat') this.receiveChat(m, 'B');
      else if (m.t === 'bye') this.dispatch({ type: 'presence', online: false, left: true }, 'B');
      return;
    }
    switch (m.t) {
      case 'state':
        if (m.s && typeof m.s === 'object') {
          this.state = m.s;
          this.publish();
        }
        break;
      case 'err':
        this.emit('error', String(m.text || 'That did not work'));
        break;
      case 'sys':
        this.addChat({ sys: true, text: String(m.text || '') });
        this.publish();
        break;
      case 'chat':
        this.receiveChat(m, 'A');
        break;
      case 'bye':
        this.onClosed(this, this.state?.players?.A?.name || 'The host');
        break;
    }
  }

  /** Host only: apply an action through the shared reducer and broadcast the result. */
  dispatch(action, p) {
    const r = reduce(this.host, action, p);
    if (r.error) {
      if (p === 'B') this.link?.send({ t: 'err', text: r.error });
      else this.emit('error', r.error);
      return;
    }
    if (action.type !== 'draft') store.set('wt-host', this.host);
    this.state = structuredClone(this.host.state);
    this.link?.send({ t: 'state', s: this.state });
    for (const text of r.events) {
      this.link?.send({ t: 'sys', text });
      this.addChat({ sys: true, text });
    }
    this.publish();
  }

  addChat(msg) {
    this.chat = [...this.chat, { ts: Date.now(), ...msg, id: ++this.chatSeq }].slice(-150);
    store.set(chatKey(this.code), this.chat);
  }

  receiveChat(m, from) {
    const msg = {
      from,
      name: cleanName(m.name) || (from === 'A' ? 'Host' : 'Guest'),
      text: String(m.text || '').trim().slice(0, 500),
      react: !!m.react,
      ts: Number(m.ts) || Date.now(),
    };
    if (!msg.text) return;
    this.addChat(msg);
    this.publish();
    this.emit('chat', msg);
  }
}

// ---------------- the single active room ----------------

let current = null;
const subscribers = new Set();
const closedListeners = new Set();
const notify = () => subscribers.forEach((fn) => fn());

function start(opts) {
  current?.dispose();
  current = new RoomSession(opts, {
    onChange: () => notify(),
    onClosed: (s, hostName) => {
      if (s !== current) return;
      s.leave();
      current = null;
      notify();
      closedListeners.forEach((fn) => fn(hostName));
    },
  });
  notify();
}

export const rooms = {
  subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },
  getSnapshot: () => current?.snapshot ?? null,
  get current() {
    return current;
  },
  /** Called when the host closes the room on the guest. */
  onClosed(fn) {
    closedListeners.add(fn);
    return () => closedListeners.delete(fn);
  },
  create(name) {
    start({ role: 'A', code: makeCode(), name, host: newRoom(name), fresh: true });
  },
  join(code, name) {
    start({ role: 'B', code: normCode(code), name });
  },
  /** After a page reload, rejoin the room this tab was in. */
  resume(name, invitedCode) {
    const saved = store.get('wt-session', null);
    if (!saved?.code || (invitedCode && normCode(invitedCode) !== saved.code)) return false;
    if (saved.role === 'A') {
      const host = store.get('wt-host', null) || newRoom(name);
      start({ role: 'A', code: saved.code, name: name || host.state.players.A.name, host });
      return true;
    }
    if (saved.role === 'B' && name) {
      start({ role: 'B', code: saved.code, name });
      return true;
    }
    return false;
  },
  leave() {
    if (!current) return;
    current.leave();
    current = null;
    notify();
  },
};
