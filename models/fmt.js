// models/fmt.js — shared value formatting + form helpers (pure functions).

function isBlob(v) {
  if (v instanceof Uint8Array) return true;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(v)) return true;
  if (v && v.type === 'Buffer' && Array.isArray(v.data)) return true;
  return false;
}

function blobBytes(v) {
  if (v instanceof Uint8Array) return v.length;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(v)) return v.length;
  if (v && Array.isArray(v.data)) return v.data.length;
  return 0;
}

// classify a DB value for safe rendering in a grid cell
function cell(v) {
  if (v === null || v === undefined) return { kind: 'null' };
  if (typeof v === 'bigint') return { kind: 'text', text: String(v) };
  if (typeof v === 'number') return { kind: 'text', text: String(v) };
  if (typeof v === 'boolean') return { kind: 'text', text: v ? '1' : '0' };
  if (isBlob(v)) return { kind: 'blob', bytes: blobBytes(v) };
  if (typeof v === 'object') {
    let text;
    try { text = JSON.stringify(v); } catch { text = String(v); }
    return { kind: 'json', text };
  }
  return { kind: 'text', text: String(v) };
}

// convert a DB value into an editable string for a form input
function toInput(v) {
  if (v === null || v === undefined) return '';
  if (isBlob(v)) return '';
  if (typeof v === 'object') { try { return JSON.stringify(v); } catch { return String(v); } }
  return String(v);
}

// which columns are editable in insert/edit forms
function editableCols(engine, cols) {
  return (cols || []).filter(c => {
    if (engine === 'maria') {
      const extra = String(c.extra || '').toLowerCase();
      if (extra.includes('auto_increment') || extra.includes('generated')) return false;
    }
    if (engine === 'pgsql') {
      if (c.identity === 'a') return false;               // GENERATED ALWAYS AS IDENTITY
      if (c.generated === 's') return false;              // stored generated column
      if (String(c.def || '').includes('nextval')) return false; // serial
    }
    if (engine === 'sqlite') {
      if (c.pk) return false;                             // INTEGER PRIMARY KEY (rowid alias)
    }
    return true;
  });
}

// guess a textarea vs input based on type string
function isLong(type) {
  const t = String(type || '').toLowerCase();
  return /text|json|blob|clob|bytea|geometry|xml|character varying\(\d{4,}\)/.test(t);
}

function bytes(n) {
  n = Number(n || 0);
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

// build an internal URL; for SQLite the db is the session file path, so it is never exposed in links
function url(s, path, obj) {
  const p = new URLSearchParams();
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === undefined || v === null || v === '') continue;
    if (s && s.engine === 'sqlite' && (k === 'db' || k === 'schema')) continue;
    p.append(k, String(v));
  }
  const qs = p.toString();
  return qs ? path + '?' + qs : path;
}

// Mask credential-bearing SQL values (IDENTIFIED BY 'x', PASSWORD 'x',
// SET PASSWORD = 'x', etc.) so they never appear in history or logs.
function redactSecrets(sql) {
  const s = String(sql || '');
  const Q = "(?:'[^']*'|\"[^\"]*\"|[^\\s,;]+)";
  const rules = [
    [`\\b(identified\\s+by)(?:\\s+password)?\\s+${Q}`, '$1 ***'],
    [`\\b(password)(\\s+for\\s+${Q}\\s*)?\\s*=\\s*${Q}`, '$1=***'],
    [`\\b(password)\\s+${Q}`, '$1 ***'],
  ];
  let out = s;
  for (const [pat, rep] of rules) out = out.replace(new RegExp(pat, 'gi'), rep);
  return out;
}

export default { cell, toInput, editableCols, isLong, bytes, isBlob, blobBytes, url, redactSecrets };
