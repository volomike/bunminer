export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.get.db || s.db || '');
  if (!db) return w.doRedirect('/server');
  if (s.engine !== 'sqlite') s.db = db;
  VIEW.title = 'Database';
  VIEW.session = s;
  VIEW.db = db;
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);
  try {
    if (s.engine === 'pgsql') {
      VIEW.schemas = await adapter.schemas(s);
      const schema = w.get.schema || s.schema || 'public';
      s.schema = schema;
      VIEW.schema = schema;
      VIEW.tables = await adapter.tables(s, schema);
    } else {
      VIEW.tables = await adapter.tables(s, db);
    }
    VIEW.error = '';
  } catch (e) {
    VIEW.tables = [];
    VIEW.error = e.message;
  }
  return w.renderView('v-db.ejs');
}
