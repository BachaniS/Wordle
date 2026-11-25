import { Peer } from 'peerjs';

// Peer-to-peer links between browsers using PeerJS (WebRTC data channels). Rooms are a
// star: the host accepts a connection from each guest, and guests only talk to the host.
// PeerJS's free public server is only used to introduce the browsers; game data and chat
// travel directly between them. Handles heartbeats and reconnection.

const PREFIX = 'wordle-together-v2-'; // v2: rooms for up to four (not compatible with v1)
const PING_MS = 3000;
const TIMEOUT_MS = 15000;
const MAX_CONNS = 8; // more than a full room needs, to allow for reconnects overlapping

const peerId = (code) => PREFIX + code.toLowerCase();

/**
 * Statuses reported through onStatus:
 *  connecting   – talking to the matchmaking server
 *  waiting      – host is online, no guests connected
 *  searching    – guest can't find the room (yet)
 *  connected    – guest: direct link to the host is up; host: at least one guest is connected
 *  reconnecting – link dropped, trying again
 *  taken        – host: this room code is already in use
 *  error        – unrecoverable (see onError)
 *
 * On the host, onOpen / onMessage / onLost also get a key naming the guest connection,
 * and send(msg, key) talks to that one guest.
 */
export class Link {
  constructor(handlers) {
    this.h = handlers;
    this.peer = null;
    this.conn = null; // guest: the link to the host
    this.pending = null; // guest: a connection still opening
    this.guests = new Map(); // host: key -> { conn, lastSeen }
    this.nextKey = 1;
    this.closed = false;
    this.status = null;
    this.timers = new Set();
    this.lastSeen = 0;
    this.beat = setInterval(() => this.heartbeat(), PING_MS);
    this.onVisible = () => document.visibilityState === 'visible' && this.wake();
    document.addEventListener('visibilitychange', this.onVisible);
  }

  host(code, retries = 0) {
    this.role = 'host';
    this.code = code;
    this.retries = retries;
    this.setStatus('connecting');
    this.makePeer();
  }

  join(code) {
    this.role = 'guest';
    this.code = code;
    this.setStatus('connecting');
    this.makePeer();
  }

  /** Guest: send to the host. Host: send to the guest connection `key`. */
  send(msg, key) {
    const conn = this.role === 'host' ? this.guests.get(key)?.conn : this.conn;
    if (!conn?.open) return false;
    try {
      conn.send(msg);
      return true;
    } catch {
      return false;
    }
  }

  /** Host: close one guest's connection. onLost is not called for it. */
  hangUp(key) {
    const g = this.guests.get(key);
    if (!g) return;
    this.guests.delete(key);
    try { g.conn.close(); } catch {}
    this.hostStatus();
  }

  close() {
    this.closed = true;
    clearInterval(this.beat);
    this.timers.forEach(clearTimeout);
    document.removeEventListener('visibilitychange', this.onVisible);
    try { this.conn?.close(); } catch {}
    for (const { conn } of this.guests.values()) try { conn.close(); } catch {}
    this.guests.clear();
    this.peer?.destroy();
  }

  // ---- internals ----

  later(fn, ms) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.closed) fn();
    }, ms);
    this.timers.add(t);
  }

  setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this.h.onStatus?.(s);
  }

  hostStatus() {
    if (!this.closed) this.setStatus(this.guests.size ? 'connected' : 'waiting');
  }

  /** Is anything connected? (Host: any guest. Guest: the host.) */
  get linked() {
    return this.role === 'host' ? this.guests.size > 0 : !!this.conn;
  }

  makePeer() {
    this.peer?.destroy();
    const peer = new Peer(this.role === 'host' ? peerId(this.code) : undefined, { debug: 0 });
    this.peer = peer;
    peer.on('open', () => {
      if (peer !== this.peer) return;
      this.everOpen = true;
      if (this.role === 'host') {
        if (!this.linked) this.setStatus('waiting');
      } else if (!this.conn) {
        this.connect();
      }
    });
    peer.on('connection', (conn) => {
      if (peer !== this.peer || this.role !== 'host') return;
      if (this.guests.size >= MAX_CONNS) {
        try { conn.close(); } catch {}
        return;
      }
      this.wireGuest(conn);
    });
    peer.on('disconnected', () => {
      if (peer === this.peer) this.scheduleRevive(2000);
    });
    peer.on('error', (err) => {
      if (peer === this.peer) this.onPeerError(err);
    });
  }

  onPeerError(err) {
    switch (err.type) {
      case 'unavailable-id':
        // After a dropped server connection the old registration can linger for a moment.
        if (this.everOpen) this.scheduleRevive(3000);
        else if (this.retries-- > 0) this.later(() => this.makePeer(), 2500);
        else this.setStatus('taken');
        break;
      case 'peer-unavailable':
        // Guest: the host isn't online (yet). Keep looking.
        this.setStatus(this.everConnected ? 'reconnecting' : 'searching');
        this.scheduleConnect(3000);
        break;
      case 'browser-incompatible':
        this.setStatus('error');
        this.h.onError?.('This browser does not support peer-to-peer connections. Try Chrome, Safari or Firefox.');
        break;
      default:
        // Network / server hiccups. Existing direct connections usually survive these.
        if (!this.linked) this.setStatus('reconnecting');
        this.scheduleRevive(3000);
    }
  }

  scheduleRevive(ms) {
    if (this.reviveTimer) return;
    this.reviveTimer = true;
    this.later(() => {
      this.reviveTimer = false;
      this.revive();
    }, ms);
  }

  /** Make sure we're registered with the matchmaking server, then (guest) reconnect. */
  revive() {
    if (this.closed) return;
    const p = this.peer;
    if (!p || p.destroyed) {
      this.retries = Math.max(this.retries || 0, 3);
      this.makePeer();
    } else if (p.disconnected) {
      try { p.reconnect(); } catch { this.makePeer(); }
    } else if (this.role === 'guest' && !this.conn) {
      this.connect();
    }
  }

  scheduleConnect(ms) {
    if (this.connectTimer) return;
    this.connectTimer = true;
    this.later(() => {
      this.connectTimer = false;
      this.connect();
    }, ms);
  }

  /** Guest: open a connection to the host. */
  connect() {
    if (this.closed || this.conn || this.role !== 'guest') return;
    const p = this.peer;
    if (!p || p.destroyed || p.disconnected) return this.revive();
    if (!p.open) return; // 'open' handler will call us
    try { this.pending?.close(); } catch {}
    const conn = p.connect(peerId(this.code), { reliable: true, serialization: 'json' });
    this.pending = conn;
    this.wireHost(conn);
    this.later(() => {
      if (conn === this.pending && !conn.open) {
        this.pending = null;
        try { conn.close(); } catch {}
        this.scheduleConnect(500);
      }
    }, 10000);
  }

  /** Guest: the connection to the host. */
  wireHost(conn) {
    conn.on('open', () => {
      if (this.closed || conn !== this.pending) {
        conn.close();
        return;
      }
      this.pending = null;
      const old = this.conn;
      this.conn = conn;
      this.lastSeen = Date.now();
      this.everConnected = true;
      if (old && old !== conn) try { old.close(); } catch {}
      this.setStatus('connected');
      this.h.onOpen?.();
    });
    conn.on('data', (d) => {
      if (conn !== this.conn) return;
      this.lastSeen = Date.now();
      if (d && typeof d === 'object' && d.t !== 'ping') this.h.onMessage?.(d);
    });
    const lost = () => this.dropHost(conn);
    conn.on('close', lost);
    conn.on('error', lost);
  }

  dropHost(conn) {
    if (conn !== this.conn) return;
    this.conn = null;
    try { conn.close(); } catch {}
    if (this.closed) return;
    this.setStatus('reconnecting');
    this.h.onLost?.();
    this.scheduleConnect(1000);
  }

  /** Host: a connection from one guest. */
  wireGuest(conn) {
    let key = null;
    conn.on('open', () => {
      if (this.closed) {
        conn.close();
        return;
      }
      key = this.nextKey++;
      this.guests.set(key, { conn, lastSeen: Date.now() });
      this.setStatus('connected');
      this.h.onOpen?.(key);
    });
    conn.on('data', (d) => {
      const g = this.guests.get(key);
      if (!g || g.conn !== conn) return;
      g.lastSeen = Date.now();
      if (d && typeof d === 'object' && d.t !== 'ping') this.h.onMessage?.(d, key);
    });
    const lost = () => this.dropGuest(key, conn);
    conn.on('close', lost);
    conn.on('error', lost);
  }

  dropGuest(key, conn) {
    const g = this.guests.get(key);
    if (!g || g.conn !== conn) return;
    this.guests.delete(key);
    try { conn.close(); } catch {}
    if (this.closed) return;
    this.hostStatus();
    this.h.onLost?.(key);
  }

  heartbeat() {
    const now = Date.now();
    if (this.role === 'host') {
      for (const [key, g] of this.guests) {
        if (now - g.lastSeen > TIMEOUT_MS) this.dropGuest(key, g.conn);
        else try { g.conn.send({ t: 'ping' }); } catch {}
      }
      return;
    }
    const c = this.conn;
    if (!c) return;
    if (now - this.lastSeen > TIMEOUT_MS) return this.dropHost(c);
    try { c.send({ t: 'ping' }); } catch {}
  }

  wake() {
    if (this.closed) return;
    if (this.role === 'host') {
      for (const [key, g] of this.guests) if (Date.now() - g.lastSeen > TIMEOUT_MS) this.dropGuest(key, g.conn);
    } else if (this.conn && Date.now() - this.lastSeen > TIMEOUT_MS) {
      this.dropHost(this.conn);
    }
    this.revive();
  }
}
