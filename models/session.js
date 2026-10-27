// models/session.js — in-memory session store (design A: DB password lives in server memory only).
// The session cookie carries an HMAC over the random session id, keyed by a per-installation
// secret (data/secret.key, 0600, generated on first use). An attacker who installs this
// open-source code on their own server learns nothing that lets them forge a valid session
// cookie for any OTHER installation.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const sessions = new Map();

function newId() {
  return crypto.randomUUID().replace(/-/g, '');
}

function cookieName(w) {
  return (w.config && w.config.sess && w.config.sess.cookie) || 'dbxadm2_sid';
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function secret() {
  const dir = join(globalThis.w.basepath, 'data');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'secret.key');
  if (!existsSync(path)) {
    writeFileSync(path, randomBytes(32).toString('hex') + '\n', { mode: 0o600 });
  }
  return readFileSync(path, 'utf8').trim();
}

function macOf(id) {
  return createHmac('sha256', secret()).update(id).digest('hex').slice(0, 32);
}

function sign(id) {
  return id + '.' + macOf(id);
}

function verify(token) {
  const i = String(token).lastIndexOf('.');
  if (i <= 0) return null;
  const id = token.slice(0, i);
  const mac = token.slice(i + 1);
  const a = Buffer.from(mac);
  const b = Buffer.from(macOf(id));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}

function clean(w) {
  const now = Date.now();
  const cfg = (w.config && w.config.sess) || {};
  const idle = (cfg.idleSec ?? 900) * 1000;
  const abs = (cfg.absoluteSec ?? 28800) * 1000;
  for (const [id, s] of sessions) {
    if (now - s.last > idle || now - s.created > abs) sessions.delete(id);
  }
}

function setCookieHeader(w, token, maxAge) {
  const parts = [`${cookieName(w)}=${token}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax'];
  if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
  w.addHeader('Set-Cookie', parts.join('; '));
}

// start a session, write the signed cookie, return the session object
function start(w, data) {
  clean(w);
  const cfg = w.config.sess || {};
  const id = newId();
  const now = Date.now();
  const s = {
    id,
    engine: data.engine,
    serverId: data.serverId,
    username: data.username || '',
    dbpass: data.dbpass || '',   // DB password — never written to disk or any cookie
    db: data.db || null,         // selected database name (MariaDB/PG) or file path (SQLite)
    schema: data.schema || null, // PostgreSQL current schema
    platform: data.platform || data.engine || '',
    host: data.host || '',
    mariaFlavor: data.mariaFlavor || null,
    csrf: newId(),
    history: [],
    permanent: !!data.permanent,
    created: now,
    last: now,
  };
  sessions.set(id, s);
  const maxAge = s.permanent ? (cfg.permanentSec ?? 604800) : null;
  setCookieHeader(w, sign(id), maxAge);
  return s;
}

// resolve the current session from the signed cookie, honoring TTL; touches last-seen
function current(w) {
  clean(w);
  const ck = parseCookies(w.getHeader('cookie') || '');
  const token = ck[cookieName(w)];
  if (!token) return null;
  const id = verify(token);
  if (!id) return null;
  const s = sessions.get(id);
  if (!s) return null;
  const cfg = w.config.sess || {};
  const now = Date.now();
  if (now - s.last > (cfg.idleSec ?? 900) * 1000) { sessions.delete(id); return null; }
  if (now - s.created > (cfg.absoluteSec ?? 28800) * 1000) { sessions.delete(id); return null; }
  s.last = now;
  return s;
}

function destroy(w) {
  const ck = parseCookies(w.getHeader('cookie') || '');
  const token = ck[cookieName(w)];
  if (token) {
    const id = verify(token);
    if (id) sessions.delete(id);
  }
  const parts = [`${cookieName(w)}=`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=0'];
  w.addHeader('Set-Cookie', parts.join('; '));
}

// redirect that PRESERVES headers set via w.addHeader (the framework's doRedirect drops them)
function redirect(w, url) {
  w.addHeader('Location', url);
  return new Response('', { status: 302, headers: w.res });
}

export default { start, current, destroy, clean, redirect };
