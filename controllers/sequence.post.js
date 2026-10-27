export default async function({ w }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  if (w.post['csrf'] !== s.csrf) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = w.post['db'] || s.db || '';
  const schema = w.post['schema'] || s.schema || 'public';
  const name = w.post['name'] || '';
  const action = w.post['action'] || 'alter';
  if (action === 'next') await adapter.nextSequence(s, schema, name);
  else if (action === 'restart') await adapter.restartSequence(s, schema, name);
  else if (action === 'set') await adapter.setSequence(s, schema, name, w.post['value']);
  else await adapter.alterSequence(s, schema, name, {
    increment: w.post['increment'],
    min: w.post['min'],
    max: w.post['max'],
    cache: w.post['cache'],
    cycle: w.post['cycle'] === '1',
  });
  return w.doRedirect(w.m.fmt.url(s, '/sequence', { db, name, schema }));
}
