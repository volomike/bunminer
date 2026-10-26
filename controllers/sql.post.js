export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  if (w.post['csrf'] !== s.csrf) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.post['db'] || s.db || '');
  const schema = s.engine === 'pgsql' ? (w.post['schema'] || s.schema || 'public') : db;
  const ns = s.engine === 'pgsql' ? schema : db;
  const sql = w.post['sql'] || '';
  const explain = w.post['explain'] === '1';
  const destructive = /^\s*(drop|truncate|delete|alter|rename|create)\b/i.test(sql);

  VIEW.title = 'SQL command';
  VIEW.session = s;
  VIEW.db = db;
  VIEW.schema = schema;
  VIEW.sql = sql;
  VIEW.explain = explain;
  VIEW.warn = destructive ? 'This statement is destructive — it can drop, truncate or rebuild data.' : '';
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);

  try {
    let results;
    if (explain) {
      const rows = await adapter.explain(s, ns, sql);
      results = [{ type: 'result', columns: rows[0] ? Object.keys(rows[0]) : [], rows }];
    } else {
      results = await adapter.execute(s, ns, sql);
    }
    results = results.map(r => {
      if (r.type !== 'result') return r;
      const truncated = r.rows.length > 1000;
      return { type: 'result', columns: r.columns, rows: r.rows.slice(0, 1000), truncated };
    });
    s.history = s.history || [];
    s.history.push({ sql, time: Date.now() });
    if (s.history.length > 100) s.history = s.history.slice(-100);
    VIEW.results = results;
    VIEW.error = '';
  } catch (e) {
    VIEW.results = null;
    VIEW.error = e.message;
  }
  return w.renderView('v-sql.ejs');
}
