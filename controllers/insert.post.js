function fieldValues(post) {
  const out = {};
  for (const [k, v] of Object.entries(post)) {
    const m = k.match(/^f\[(.*)\]$/);
    if (m) out[m[1]] = (v === '' || v === undefined || v === null) ? null : v;
  }
  return out;
}

export default async function({ w }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  if (w.post['csrf'] !== s.csrf) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.post['db'] || s.db || '');
  const table = w.post['table'] || '';
  const schema = s.engine === 'pgsql' ? (w.post['schema'] || s.schema || 'public') : db;
  const ns = s.engine === 'pgsql' ? schema : db;
  const values = fieldValues(w.post);
  await adapter.insert(s, ns, table, values);
  const back = w.post['back'] || '';
  return w.doRedirect((back.startsWith('/') && !back.startsWith('//')) ? back : w.m.fmt.url(s, '/select', { db, table, schema }));
}
