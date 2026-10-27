export default async function({ w }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  if (w.post['csrf'] !== s.csrf) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = w.post['db'] || s.db || '';
  const schema = w.post['schema'] || s.schema || 'public';
  const action = w.post['action'] || 'create';
  if (action === 'create') {
    const name = (w.post['name'] || '').trim();
    const values = String(w.post['values'] || '').split(',').map(v => v.trim()).filter(Boolean);
    if (!values.length) throw new Error('At least one enum value required');
    await adapter.createEnum(s, schema, name, values);
  } else if (action === 'addvalue') {
    await adapter.addEnumValue(s, schema, (w.post['name'] || '').trim(), (w.post['value'] || '').trim(), { before: (w.post['before'] || '').trim() || null });
  } else if (action === 'drop') {
    await adapter.dropType(s, schema, (w.post['name'] || '').trim(), w.post['cascade'] === '1');
  }
  return w.doRedirect(w.m.fmt.url(s, '/types', { db, schema }));
}
