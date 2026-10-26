export default async function({ w }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  if (w.post['csrf'] !== s.csrf) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.post['db'] || s.db || '');
  const table = w.post['table'] || '';
  const schema = s.engine === 'pgsql' ? (w.post['schema'] || s.schema || 'public') : db;
  const ns = s.engine === 'pgsql' ? schema : db;
  const action = w.post['action'] || 'add';
  const column = (w.post['column'] || '').trim();
  const col = {
    name: (w.post['name'] || '').trim(),
    type: (w.post['type'] || '').trim(),
    length: (w.post['length'] || '').trim(),
    unsigned: w.post['unsigned'] === '1',
    nullable: w.post['null'] !== '1',
    autoInc: w.post['ai'] === '1',
    def: String(w.post['def'] || '').trim() || null,
  };
  if (action === 'add') await adapter.addColumn(s, ns, table, col);
  else if (action === 'drop') await adapter.dropColumn(s, ns, table, column);
  else if (action === 'edit') await adapter.editColumn(s, ns, table, column, col);
  return w.doRedirect(w.m.fmt.url(s, '/table', { db, table, schema }));
}
