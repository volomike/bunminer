// models/audit.js — append-only audit log (JSONL) to /var/log/bunminer, self-rotating.
// Records security-relevant events (logins, SQL, exports) with the client IP. Auditing
// must never break a request, so every write is wrapped in try/catch and is synchronous
// (small writes). The log directory is configurable via config.audit.

import { appendFileSync, mkdirSync, existsSync, statSync, renameSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const DEFAULTS = { dir: '/var/log/bunminer', maxBytes: 5 * 1024 * 1024, keep: 5 };

function config() {
  const c = (globalThis.w && globalThis.w.config && globalThis.w.config.audit) || {};
  return {
    dir: c.dir || DEFAULTS.dir,
    maxBytes: c.maxBytes || DEFAULTS.maxBytes,
    keep: c.keep || DEFAULTS.keep,
  };
}

function log(event, data) {
  try {
    const { dir, maxBytes, keep } = config();
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'audit.log');

    // Rotate when the current file has reached the size cap: prune the oldest
    // rotated files, shift audit.log.N -> audit.log.(N+1), then move audit.log
    // to audit.log.1 so a fresh audit.log starts next.
    if (existsSync(file)) {
      let size = 0;
      try { size = statSync(file).size; } catch (e) { /* keep 0 */ }
      if (size >= maxBytes) {
        let files = [];
        try {
          files = readdirSync(dir)
            .filter(f => /^audit\.log\.\d+$/.test(f))
            .sort((a, b) => Number(a.split('.').pop()) - Number(b.split('.').pop()));
        } catch (e) { /* keep [] */ }
        while (files.length >= keep) {
          const oldest = files.shift();
          try { unlinkSync(path.join(dir, oldest)); } catch (e) { /* ignore */ }
        }
        for (let i = keep - 1; i >= 1; i--) {
          const src = path.join(dir, `audit.log.${i}`);
          if (existsSync(src)) {
            try { renameSync(src, path.join(dir, `audit.log.${i + 1}`)); } catch (e) { /* ignore */ }
          }
        }
        try { renameSync(file, path.join(dir, 'audit.log.1')); } catch (e) { /* ignore */ }
      }
    }

    const line = JSON.stringify({ ts: new Date().toISOString(), event, ...(data || {}) }) + '\n';
    appendFileSync(file, line);
  } catch (e) {
    // Intentionally swallowed — auditing must never break a request.
  }
}

export default { log };
