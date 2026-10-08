import { Peer } from 'peerjs';

// Peer-to-peer link between two browsers using PeerJS (WebRTC data channels).
// PeerJS's free public server is only used to introduce the two browsers; game data
// and chat travel directly between them. Handles heartbeats and reconnection.

const PREFIX = 'wordle-together-v1-';
const PING_MS = 3000;
const TIMEOUT_MS = 15000;

const peerId = (code) => PREFIX + code.toLowerCase();

/**
 * Statuses reported through onStatus:
 *  connecting   – talking to the matchmaking server
 *  waiting      – host is online, partner not connected
 *  searching    – guest can't find the room (yet)
 *  connected    – direct link is up
 *  reconnecting – link dropped, trying again
 *  taken        – host: this room code is already in use
 *  error        – unrecoverable (see onError)
 */
export class Link {
  constructor(handlers) {
    this.h = handlers;
    this.peer = null;
    this.conn = null;
    this.pending = null;
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

  send(msg) {
    if (!this.conn?.open) return false;
    try {
      this.conn.send(msg);
      return true;
    } catch {
      return false;
    }
  }

  close() {
    this.closed = true;
    clearInterval(this.beat);
    this.timers.forEach(clearTimeout);
    document.removeEventListener('visibilitychange', this.onVisible);
    try { this.conn?.close(); } catch {}
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

  makePeer() {
    this.peer?.destroy();
    const peer = new Peer(this.role === 'host' ? peerId(this.code) : undefined, { debug: 0 });
    this.peer = peer;
    peer.on('open', () => {
      if (peer !== this.peer) return;
      this.everOpen = true;
      if (this.role === 'host') {
        if (!this.conn) this.setStatus('waiting');
      } else if (!this.conn) {
        this.connect();
      }
    });
    peer.on('connection', (conn) => {
      if (peer === this.peer && this.role === 'host') this.wire(conn);
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
        // Network / server hiccups. An existing direct connection usually survives these.
        if (!this.conn) this.setStatus('reconnecting');
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

  connect() {
    if (this.closed || this.conn || this.role !== 'guest') return;
    const p = this.peer;
    if (!p || p.destroyed || p.disconnected) return this.revive();
    if (!p.open) return; // 'open' handler will call us
    try { this.pending?.close(); } catch {}
    const conn = p.connect(peerId(this.code), { reliable: true, serialization: 'json' });
    this.pending = conn;
    this.wire(conn);
    this.later(() => {
      if (conn === this.pending && !conn.open) {
        this.pending = null;
        try { conn.close(); } catch {}
        this.scheduleConnect(500);
      }
    }, 10000);
  }

  wire(conn) {
    conn.on('open', () => {
      if (this.closed || (this.role === 'guest' && conn !== this.pending)) {
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
    const lost = () => this.drop(conn);
    conn.on('close', lost);
    conn.on('error', lost);
  }

  drop(conn) {
    if (conn !== this.conn) return;
    this.conn = null;
    try { conn.close(); } catch {}
    if (this.closed) return;
    this.setStatus(this.role === 'host' ? 'waiting' : 'reconnecting');
    this.h.onLost?.();
    if (this.role === 'guest') this.scheduleConnect(1000);
  }

  heartbeat() {
    const c = this.conn;
    if (!c) return;
    if (Date.now() - this.lastSeen > TIMEOUT_MS) return this.drop(c);
    try { c.send({ t: 'ping' }); } catch {}
  }

  wake() {
    if (this.closed) return;
    if (this.conn && Date.now() - this.lastSeen > TIMEOUT_MS) this.drop(this.conn);
    this.revive();
  }
}
