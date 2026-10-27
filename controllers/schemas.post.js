export default async function({ w }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  if (w.post['csrf'] !== s.csrf) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = w.post['db'] || s.db || '';
  const action = w.post['action'] || 'create';
  if (action === 'create') {
    await adapter.createSchema(s, (w.post['name'] || '').trim(), (w.post['owner'] || '').trim() || null);
  } else if (action === 'drop') {
    await adapter.dropSchema(s, (w.post['name'] || '').trim(), w.post['cascade'] === '1');
  } else if (action === 'rename') {
    await adapter.renameSchema(s, (w.post['name'] || '').trim(), (w.post['newname'] || '').trim());
  }
  return w.doRedirect(w.m.fmt.url(s, '/db', { db }));
}
