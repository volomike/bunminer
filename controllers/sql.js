export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.get.db || s.db || '');
  if (!db) return w.doRedirect('/server');
  const schema = s.engine === 'pgsql' ? (w.get.schema || s.schema || 'public') : db;
  VIEW.title = 'SQL command';
  VIEW.session = s;
  VIEW.db = db;
  VIEW.schema = schema;
  VIEW.sql = w.get.sql || '';
  VIEW.warn = /^\s*(drop|truncate|delete|alter|rename|create)\b/i.test(VIEW.sql) ? 'This statement is destructive — it can drop, truncate or rebuild data.' : '';
  VIEW.results = null;
  VIEW.error = '';
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);
  return w.renderView('v-sql.ejs');
}
