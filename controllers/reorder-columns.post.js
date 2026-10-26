export default async function({ w }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  if (w.post['csrf'] !== s.csrf) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.post['db'] || s.db || '');
  const table = w.post['table'] || '';
  const schema = s.engine === 'pgsql' ? (w.post['schema'] || s.schema || 'public') : db;
  const ns = s.engine === 'pgsql' ? schema : db;
  if (s.engine !== 'maria') return w.doRedirect(w.m.fmt.url(s, '/table', { db, table, schema }));
  const order = String(w.post['order'] || '').split(',').map(x => x.trim()).filter(Boolean);
  if (order.length) await adapter.reorderColumns(s, ns, table, order);
  return w.doRedirect(w.m.fmt.url(s, '/table', { db, table, schema }));
}
