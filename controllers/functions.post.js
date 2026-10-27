function qid(x) { return '"' + String(x).replace(/"/g, '""') + '"'; }

export default async function({ w }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  if (w.post['csrf'] !== s.csrf) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = w.post['db'] || s.db || '';
  const schema = w.post['schema'] || s.schema || 'public';
  if (w.post['action'] === 'drop') {
    await adapter.dropFunction(s, schema, (w.post['name'] || '').trim(), w.post['args'] || '');
    return w.doRedirect(w.m.fmt.url(s, '/functions', { db, schema }));
  }
  const name = (w.post['name'] || '').trim();
  const args = (w.post['args'] || '').trim();
  const ret = (w.post['ret'] || '').trim();
  const lang = (w.post['lang'] || 'sql').trim();
  const body = w.post['body'] || '';
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Invalid function name');
  if (args && !/^[A-Za-z0-9 _,."()\[\]]*$/.test(args)) throw new Error('Invalid arguments');
  if (!/^[A-Za-z0-9 _.()\[\]]*$/.test(ret)) throw new Error('Invalid return type');
  const sql = `CREATE FUNCTION ${qid(schema)}.${qid(name)}(${args})\nRETURNS ${ret}\nLANGUAGE ${lang}\nAS $func$\n${body}\n$func$`;
  await adapter.createFunction(s, sql);
  return w.doRedirect(w.m.fmt.url(s, '/functions', { db, schema }));
}
