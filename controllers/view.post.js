export default async function({ w }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  if (w.post['csrf'] !== s.csrf) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = w.post['db'] || s.db || '';
  const schema = w.post['schema'] || s.schema || 'public';
  const name = (w.post['name'] || '').trim();
  if (w.post['action'] === 'refresh') {
    await adapter.refreshView(s, schema, name);
    return w.doRedirect(w.m.fmt.url(s, '/db', { db, schema }));
  }
  await adapter.createView(s, schema, name, w.post['body'] || '', {
    materialized: w.post['materialized'] === '1',
    replace: w.post['replace'] === '1',
  });
  return w.doRedirect(w.m.fmt.url(s, '/db', { db, schema }));
}
