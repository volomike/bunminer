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
  if (action === 'add') {
    const name = (w.post['name'] || '').trim();
    const unique = w.post['unique'] === '1';
    const columns = String(w.post['columns'] || '').split(',').map(x => x.trim()).filter(Boolean);
    if (columns.some(c => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(c))) throw new Error('Invalid column name in index');
    await adapter.createIndex(s, ns, table, name, columns, unique);
  } else if (action === 'drop') {
    await adapter.dropIndex(s, ns, table, (w.post['name'] || '').trim());
  } else if (action === 'rename') {
    await adapter.renameIndex(s, ns, table, (w.post['old'] || '').trim(), (w.post['name'] || '').trim());
  }
  return w.doRedirect(w.m.fmt.url(s, '/table', { db, table, schema }));
}
