// Hard cap on a single cell/download size — a multi-GB BLOB must not be pulled
// through the app into memory per request.
const MAX_BLOB_BYTES = 64 * 1024 * 1024;

export default async function({ w }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.get.db || s.db || '');
  const table = w.get.table || '';
  const schema = s.engine === 'pgsql' ? (w.get.schema || s.schema || 'public') : db;
  const ns = s.engine === 'pgsql' ? schema : db;
  const col = w.get.col || '';

  const pkCols = [];
  const pkVals = [];
  for (const [k, v] of Object.entries(w.get)) {
    const m = k.match(/^where\[(.*)\]$/);
    if (m) { pkCols.push(m[1]); pkVals.push(v); }
  }
  const val = await adapter.blob(s, ns, table, col, pkCols, pkVals);

  if (val === null || val === undefined) {
    return new Response('NULL', { headers: { 'Content-Type': 'text/plain' } });
  }
  let bytes;
  let isText = false;
  if (typeof val === 'string') { bytes = new TextEncoder().encode(val); isText = true; }
  else if (val instanceof Uint8Array) bytes = val;
  else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(val)) bytes = new Uint8Array(val);
  else { bytes = new TextEncoder().encode(String(val)); isText = true; }

  const size = bytes.byteLength !== undefined ? bytes.byteLength : bytes.length;
  if (size > MAX_BLOB_BYTES) {
    return new Response('Blob too large to download', { status: 413, headers: { 'Content-Type': 'text/plain' } });
  }

  const name = `${table}.${col}.bin`;
  return new Response(bytes, {
    headers: {
      'Content-Type': isText ? 'text/plain; charset=utf-8' : 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${name}"`,
    },
  });
}
