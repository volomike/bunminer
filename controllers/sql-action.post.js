export default async function({ w }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  if (w.post['csrf'] !== s.csrf) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const res = s.sqlResult;
  if (!res) return w.doRedirect('/sql');
  const ns = s.engine === 'pgsql' ? res.schema : res.db;
  const action = w.post['action'] || 'delete';

  let keys = [];
  try { keys = JSON.parse(w.post['rows'] || '[]'); } catch {}
  if (!Array.isArray(keys)) keys = [];
  const parsed = keys.map(k => {
    const o = Object.fromEntries(new URLSearchParams(k).entries());
    return { cols: Object.keys(o), vals: Object.keys(o).map(c => o[c]) };
  }).filter(p => p.cols.length);

  if (action === 'export') {
    const pkRows = parsed.map(p => p.vals);
    const bytes = await adapter.exportRows(s, ns, res.table, res.pkCols, pkRows);
    const out = Bun.gzipSync(bytes);
    return new Response(out, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${res.table}.selected.sql.gz"`,
      },
    });
  }

  for (const p of parsed) await adapter.remove(s, ns, res.table, p.cols, p.vals);

  // keep the in-memory result in sync so the grid no longer shows the deleted rows
  const deleted = new Set(keys);
  s.sqlResult.rows = res.rows.filter(r => {
    const kp = new URLSearchParams();
    for (const c of res.pkCols) kp.append(c, String(r[c]));
    return !deleted.has(kp.toString());
  });
  s.sqlResult.total = s.sqlResult.rows.length;

  return w.doRedirect('/sql');
}
