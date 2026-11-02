// models/guard.js — in-memory login brute-force guard.
// Per-IP throttling + per-username lockout. Counters are per-process (single instance, KISS)
// and reset on restart. clientIp() does NOT trust forwarded headers unless the operator
// opts in via config.trustProxyHeaders — the product cannot assume a proxy is in front.

const byIp = new Map();
const byUser = new Map();

const IP_WINDOW_MS = 5 * 60 * 1000;    // counting window per IP
const IP_MAX_FAILS = 10;               // failures before an IP block
const IP_BLOCK_MS = 15 * 60 * 1000;    // block duration
const USER_WINDOW_MS = 10 * 60 * 1000; // counting window per username
const USER_MAX_FAILS = 5;              // failures before a username lock
const USER_LOCK_MS = 10 * 60 * 1000;   // lock duration

// Resolve the client IP for rate limiting. Forwarded headers are trusted only when the
// operator explicitly opts in (config.trustProxyHeaders) because any client that can reach
// the app directly can spoof them. Default: the real socket address; behind a local reverse
// proxy (loopback connection) the right-most X-Forwarded-For entry is the one the proxy
// appended itself, which the client cannot forge.
function clientIp(w, server) {
  const cfg = (globalThis.w && globalThis.w.config) || {};
  if (cfg.trustProxyHeaders === true) {
    const cf = w.getHeader('cf-connecting-ip');
    if (cf) return String(cf).split(',')[0].trim();
    const xf = w.getHeader('x-forwarded-for');
    if (xf) return String(xf).split(',')[0].trim();
  }
  let sock = '';
  if (server && typeof server.requestIP === 'function') {
    try { const a = server.requestIP(w.req); sock = (a && a.address) || ''; } catch (e) { /* ignore */ }
  }
  if (sock && sock !== '127.0.0.1' && sock !== '::1') return sock;
  const xf = w.getHeader('x-forwarded-for');
  if (xf) {
    const parts = String(xf).split(',').map(x => x.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return sock || 'unknown';
}

// milliseconds the caller must wait (0 = free to try)
function blockedFor(w, user) {
  const now = Date.now();
  const ip = clientIp(w);
  let ms = 0;
  const e = byIp.get(ip);
  if (e && e.blockedUntil && now < e.blockedUntil) ms = e.blockedUntil - now;
  if (user) {
    const u = byUser.get(user);
    if (u && u.lockedUntil && now < u.lockedUntil) ms = Math.max(ms, u.lockedUntil - now);
  }
  return ms;
}

function fail(ip, user) {
  const now = Date.now();
  let e = byIp.get(ip) || { fails: 0, first: now, blockedUntil: 0 };
  if (now - e.first > IP_WINDOW_MS) e = { fails: 0, first: now, blockedUntil: 0 };
  e.fails += 1;
  if (e.fails >= IP_MAX_FAILS) { e.blockedUntil = now + IP_BLOCK_MS; e.fails = 0; e.first = now; }
  byIp.set(ip, e);
  if (user) {
    let u = byUser.get(user) || { fails: 0, first: now, lockedUntil: 0 };
    if (now - u.first > USER_WINDOW_MS) u = { fails: 0, first: now, lockedUntil: 0 };
    u.fails += 1;
    if (u.fails >= USER_MAX_FAILS) { u.lockedUntil = now + USER_LOCK_MS; u.fails = 0; u.first = now; }
    byUser.set(user, u);
  }
}

function success(ip, user) {
  byIp.delete(ip);
  if (user) byUser.delete(user);
}

export default { blockedFor, fail, success, clientIp };
