function parseCols(post) {
  const out = [];
  let i = 0;
  while (true) {
    const raw = post[`c[${i}][name]`];
    if (raw === undefined) break;
    const name = String(raw).trim();
    if (name) {
      out.push({
        name,
        type: String(post[`c[${i}][type]`] || '').trim(),
        length: String(post[`c[${i}][length]`] || '').trim(),
        unsigned: post[`c[${i}][unsigned]`] === '1',
        nullable: post[`c[${i}][null]`] !== '1',
        autoInc: post[`c[${i}][ai]`] === '1',
        def: String(post[`c[${i}][def]`] || '').trim() || null,
      });
    }
    i++;
  }
  return out;
}

export default async function({ w }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  if (w.post['csrf'] !== s.csrf) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.post['db'] || s.db || '');
  const schema = s.engine === 'pgsql' ? (w.post['schema'] || s.schema || 'public') : db;
  const ns = s.engine === 'pgsql' ? schema : db;
  const name = (w.post['name'] || '').trim();
  const cols = parseCols(w.post);
  if (!name) return w.doRedirect(w.m.fmt.url(s, '/db', { db, schema }));
  const opts = { engine: w.post['engine'] || 'InnoDB', charset: 'utf8mb4' };
  await adapter.createTable(s, ns, name, cols, opts);
  return w.doRedirect(w.m.fmt.url(s, '/table', { db, table: name, schema }));
}
