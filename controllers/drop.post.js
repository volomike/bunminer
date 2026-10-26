export default async function({ w }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  if (w.post['csrf'] !== s.csrf) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.post['db'] || s.db || '');
  const table = w.post['table'] || '';
  const schema = s.engine === 'pgsql' ? (w.post['schema'] || s.schema || 'public') : db;
  const ns = s.engine === 'pgsql' ? schema : db;
  const action = w.post['action'] || 'drop';
  if (action === 'truncate') await adapter.truncate(s, ns, table);
  else await adapter.dropTable(s, ns, table, w.post['kind'] || 'table');
  return w.doRedirect(w.m.fmt.url(s, '/db', { db, schema }));
}
