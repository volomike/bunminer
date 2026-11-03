export default async function({ w, server }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  if (w.post['csrf'] !== s.csrf) return w.doRedirect('/');
  const ip = w.m.guard.clientIp(w, server);
  const adapter = w.m[s.engine];
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.post['db'] || s.db || '');
  const table = w.post['table'] || '';
  const schema = s.engine === 'pgsql' ? (w.post['schema'] || s.schema || 'public') : db;
  const ns = s.engine === 'pgsql' ? schema : db;
  const action = w.post['action'] || 'delete';
  const all = w.post['all'] === '1';
  const where = (w.post['where'] || '').trim();

  w.m.audit.log('bulk', { ip, db, table, action, all });

  if (all) {
    if (action === 'export') {
      const { pkCols, pkRows } = await adapter.pks(s, ns, table, where);
      const bytes = await adapter.exportRows(s, ns, table, pkCols, pkRows);
      const out = Bun.gzipSync(bytes);
      return new Response(out, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${table}.selected.sql.gz"`,
        },
      });
    }
    await adapter.deleteWhere(s, ns, table, where);
    return w.doRedirect(w.m.fmt.url(s, '/select', { db, table, schema }));
  }

  let keys = [];
  try { keys = JSON.parse(w.post['rows'] || '[]'); } catch {}
  if (!Array.isArray(keys)) keys = [];
  const parsed = keys.map(k => {
    const o = Object.fromEntries(new URLSearchParams(k).entries());
    return { cols: Object.keys(o), vals: Object.keys(o).map(c => o[c]) };
  }).filter(p => p.cols.length);

  if (action === 'export') {
    const pkCols = parsed.length ? parsed[0].cols : [];
    const pkRows = parsed.map(p => p.vals);
    const bytes = await adapter.exportRows(s, ns, table, pkCols, pkRows);
    const out = Bun.gzipSync(bytes);
    return new Response(out, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${table}.selected.sql.gz"`,
      },
    });
  }

  for (const p of parsed) {
    await adapter.remove(s, ns, table, p.cols, p.vals);
  }
  return w.doRedirect(w.m.fmt.url(s, '/select', { db, table, schema }));
}
