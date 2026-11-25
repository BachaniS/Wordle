// The active room, exposed as an external store for React
// (subscribe / getSnapshot, used through useSyncExternalStore).
//
// Rooms are a star. The host's browser is the referee: every guest connects to it, and
// it runs `reduce` from room.js for everyone, keeps the secret words, hands out seats,
// relays chat between guests, and broadcasts the shared state after every change.
import { Link } from './net.js';
import { claimSeat, cleanName, newRoom, playerName, reduce, MAX_PLAYERS, SEATS } from './room.js';
import { randomAnswer } from './wordle.js';
import { session as store } from './storage.js';

export const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const makeCode = () => randomAnswer().toUpperCase() + String(Math.floor(Math.random() * 90) + 10);
const chatKey = (code) => `wt-chat-${code}`;
const GUEST_FORBIDDEN = new Set(['hello', 'presence', 'leave']);

/** A random id for this tab, so the host gives us our seat back after a reload or reconnect. */
function clientId() {
  let id = store.get('wt-client', null);
  if (!id) {
    id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    store.set('wt-client', id);
  }
  return id;
}

class RoomSession {
  constructor({ isHost, code, name, room = null, fresh = false }, { onChange, onClosed }) {
    Object.assign(this, { isHost, code, name, room, fresh, onChange, onClosed });
    this.me = isHost ? 'A' : null; // guests learn their seat from the host's 'welcome'
    this.status = 'connecting';
    this.error = '';
    this.listeners = {};
    this.seatOf = new Map(); // host: guest connection key -> seat
    if (room) {
      room.state.players.A = { name, online: true };
      // Nobody is connected yet (this may be a reload). Guests come back online when they say hello.
      for (const q of SEATS) if (q !== 'A' && room.state.players[q]) room.state.players[q].online = false;
    }
    this.state = room ? structuredClone(room.state) : null;
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
    if (this.isHost) return this.dispatch(action, 'A');
    if (!this.link?.send({ t: 'act', a: action }) && action.type !== 'draft') {
      this.emit('error', 'Not connected — hang on a sec…');
    }
  }

  /** Duel: lock in the word the next player has to guess. */
  pickWord(word) {
    this.myPick = { code: this.code, gameId: this.state?.game?.id, word };
    store.set('wt-mypick', this.myPick);
    this.publish();
    this.act({ type: 'pick', word });
  }

  sendChat(text, react = false) {
    text = String(text).trim().slice(0, 500);
    if (!text || !this.me) return false;
    const ts = Date.now();
    const msg = { t: 'chat', from: this.me, name: this.name, text, react, ts };
    const sent = this.isHost ? this.broadcast(msg) > 0 : this.link?.send(msg);
    if (!sent) return false;
    this.addChat({ from: this.me, name: this.name, text, react, ts });
    this.publish();
    return true;
  }

  leave() {
    if (this.isHost) this.broadcast({ t: 'bye' });
    else this.link?.send({ t: 'bye' });
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
    const { isHost: host, me, code, status, error, state, chat, myPick } = this;
    this.snapshot = { host, me, code, status, error, state, chat, myPick };
    if (notify) this.onChange();
  }

  persist() {
    store.set('wt-session', { host: this.isHost, code: this.code });
    if (this.room) store.set('wt-host', this.room);
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
        if (link === this.link && !this.isHost) link.send({ t: 'hello', name: this.name, id: clientId() });
      },
      onLost: (key) => {
        if (link !== this.link) return;
        if (this.isHost) this.guestLost(key);
        else this.publish();
      },
      onMessage: (m, key) => {
        if (link !== this.link) return;
        if (this.isHost) this.fromGuest(m, key);
        else this.fromHost(m);
      },
    });
    this.link = link;
    if (this.isHost) link.host(this.code, this.fresh ? 0 : 6);
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

  /** Guest: stop for good (room full, or this room is open in another tab). */
  stop(status, error) {
    const link = this.link;
    this.link = null;
    link?.close();
    this.status = status;
    this.error = error;
    this.publish();
  }

  fromHost(m) {
    switch (m.t) {
      case 'welcome':
        if (SEATS.includes(m.seat)) {
          this.me = m.seat;
          this.publish();
        }
        break;
      case 'full':
        this.stop('full', `Room ${this.code} is full — it fits ${MAX_PLAYERS} players.`);
        break;
      case 'replaced':
        this.stop('replaced', 'You opened this room in another tab, so this one has stepped aside.');
        break;
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
        if (SEATS.includes(m.from) && m.from !== this.me) this.receiveChat(m, m.from);
        break;
      case 'bye':
        this.onClosed(this, playerName(this.state, 'A'));
        break;
    }
  }

  // ---------------- host only ----------------

  fromGuest(m, key) {
    if (m.t === 'hello') return this.welcome(m, key);
    const seat = this.seatOf.get(key);
    if (!seat) return; // they have to say hello first
    if (m.t === 'act' && typeof m.a?.type === 'string' && !GUEST_FORBIDDEN.has(m.a.type)) this.dispatch(m.a, seat);
    else if (m.t === 'chat') this.receiveChat(m, seat, key);
    else if (m.t === 'bye') {
      this.seatOf.delete(key);
      this.dispatch({ type: 'leave' }, seat);
    }
  }

  welcome(m, key) {
    const link = this.link;
    const seat = claimSeat(this.room, m.id);
    if (!seat) {
      link.send({ t: 'full' }, key);
      setTimeout(() => link.hangUp(key), 500);
      return;
    }
    // Same player on a new connection: a reconnect that beat the old one timing out,
    // or the room opened in a second tab. Either way the newest connection wins.
    for (const [k, q] of this.seatOf) {
      if (q !== seat || k === key) continue;
      this.seatOf.delete(k);
      link.send({ t: 'replaced' }, k);
      setTimeout(() => link.hangUp(k), 500);
    }
    this.seatOf.set(key, seat);
    link.send({ t: 'welcome', seat }, key);
    this.dispatch({ type: 'hello', name: m.name }, seat);
  }

  guestLost(key) {
    const seat = this.seatOf.get(key);
    this.seatOf.delete(key);
    if (seat && ![...this.seatOf.values()].includes(seat)) this.dispatch({ type: 'presence', online: false }, seat);
  }

  /** Apply an action through the shared reducer and broadcast the result. */
  dispatch(action, p) {
    const r = reduce(this.room, action, p);
    if (r.error) {
      if (p === 'A') this.emit('error', r.error);
      else this.sendTo(p, { t: 'err', text: r.error });
      return;
    }
    if (action.type !== 'draft') store.set('wt-host', this.room);
    this.state = structuredClone(this.room.state);
    this.broadcast({ t: 'state', s: this.state });
    for (const text of r.events) {
      this.broadcast({ t: 'sys', text });
      this.addChat({ sys: true, text });
    }
    this.publish();
  }

  /** Send to every seated guest (except connection `exceptKey`). Returns how many it reached. */
  broadcast(msg, exceptKey) {
    let n = 0;
    for (const key of this.seatOf.keys()) if (key !== exceptKey && this.link?.send(msg, key)) n++;
    return n;
  }

  sendTo(seat, msg) {
    for (const [key, q] of this.seatOf) if (q === seat) this.link?.send(msg, key);
  }

  // ---------------- chat ----------------

  addChat(msg) {
    this.chat = [...this.chat, { ts: Date.now(), ...msg, id: ++this.chatSeq }].slice(-150);
    store.set(chatKey(this.code), this.chat);
  }

  receiveChat(m, from, key) {
    const msg = {
      from,
      name: cleanName(m.name) || playerName(this.state, from),
      text: String(m.text || '').trim().slice(0, 500),
      react: !!m.react,
      ts: Number(m.ts) || Date.now(),
    };
    if (!msg.text) return;
    if (this.isHost) this.broadcast({ t: 'chat', ...msg }, key); // pass it on to the other guests
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
  /** Called when the host closes the room on a guest. */
  onClosed(fn) {
    closedListeners.add(fn);
    return () => closedListeners.delete(fn);
  },
  create(name) {
    start({ isHost: true, code: makeCode(), name, room: newRoom(name), fresh: true });
  },
  join(code, name) {
    start({ isHost: false, code: normCode(code), name });
  },
  /** After a page reload, rejoin the room this tab was in. */
  resume(name, invitedCode) {
    const saved = store.get('wt-session', null);
    if (!saved?.code || (invitedCode && normCode(invitedCode) !== saved.code)) return false;
    if (saved.host ?? saved.role === 'A') {
      const stored = store.get('wt-host', null);
      const room = stored?.seats ? stored : newRoom(name); // a room saved by the two-player version starts afresh
      start({ isHost: true, code: saved.code, name: name || room.state.players.A.name, room });
      return true;
    }
    if (name) {
      start({ isHost: false, code: saved.code, name });
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
