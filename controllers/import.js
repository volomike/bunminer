export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.get.db || s.db || '');
  if (!db) return w.doRedirect('/server');
  const schema = s.engine === 'pgsql' ? (w.get.schema || s.schema || 'public') : db;
  VIEW.title = 'Import';
  VIEW.session = s;
  VIEW.db = db;
  VIEW.schema = schema;
  VIEW.result = null;
  VIEW.error = '';
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);
  return w.renderView('v-import.ejs');
}
