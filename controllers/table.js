export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.get.db || s.db || '');
  const table = w.get.table || '';
  if (!db || !table) return w.doRedirect('/server');
  if (s.engine !== 'sqlite') s.db = db;
  const schema = s.engine === 'pgsql' ? (w.get.schema || s.schema || 'public') : db;
  if (s.engine === 'pgsql') s.schema = schema;
  const ns = s.engine === 'pgsql' ? schema : db;

  VIEW.title = 'Table';
  VIEW.session = s;
  VIEW.db = db;
  VIEW.table = table;
  VIEW.schema = schema;
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);
  VIEW.loadJqueryUi = s.engine === 'maria';

  try {
    VIEW.info = await adapter.columns(s, ns, table);
    VIEW.error = '';
  } catch (e) {
    VIEW.info = { cols: [], indexes: [], fks: [], createSql: '', pk: [] };
    VIEW.error = e.message;
  }
  return w.renderView('v-table.ejs');
}
