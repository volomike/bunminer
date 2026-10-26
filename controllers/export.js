export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.get.db || s.db || '');
  if (!db) return w.doRedirect('/server');
  const schema = s.engine === 'pgsql' ? (w.get.schema || s.schema || 'public') : db;
  const ns = s.engine === 'pgsql' ? schema : db;
  VIEW.title = 'Export';
  VIEW.session = s;
  VIEW.db = db;
  VIEW.schema = schema;
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);
  try {
    VIEW.tables = await adapter.tables(s, ns);
    VIEW.error = '';
  } catch (e) {
    VIEW.tables = [];
    VIEW.error = e.message;
  }
  return w.renderView('v-export.ejs');
}
