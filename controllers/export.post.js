export default async function({ w }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  if (w.post['csrf'] !== s.csrf) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.post['db'] || s.db || '');
  const schema = s.engine === 'pgsql' ? (w.post['schema'] || s.schema || 'public') : db;
  const structureOnly = w.post['structure'] === '1';
  const dataOnly = w.post['data'] === '1';
  const gzip = w.post['gzip'] === '1';
  const tables = Object.entries(w.post).filter(([k]) => k.startsWith('t[')).map(([k]) => k.slice(2, -1));

  let bytes;
  if (s.engine === 'sqlite') {
    bytes = await adapter.dump(s, { structureOnly, dataOnly });
  } else if (s.engine === 'pgsql') {
    const opts = { structureOnly, dataOnly };
    if (tables.length === 1) opts.table = tables[0];
    bytes = await adapter.dump(s, db, opts);
  } else {
    bytes = await adapter.dump(s, db, { structureOnly, dataOnly, tables });
  }

  let out = bytes;
  let ext = 'sql';
  if (gzip) { out = Bun.gzipSync(bytes); ext = 'sql.gz'; }
  const name = (s.engine === 'sqlite' ? 'database' : db) + '.' + ext;
  return new Response(out, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${name}"`,
    },
  });
}
