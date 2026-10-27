export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.get.db || s.db || '');
  const table = w.get.table || '';
  if (!db || !table) return w.doRedirect('/server');
  const schema = s.engine === 'pgsql' ? (w.get.schema || s.schema || 'public') : db;
  const ns = s.engine === 'pgsql' ? schema : db;
  const renameName = w.get.name || '';
  VIEW.title = renameName ? 'Rename index' : 'Add index';
  VIEW.session = s;
  VIEW.db = db;
  VIEW.table = table;
  VIEW.schema = schema;
  VIEW.renameName = renameName;
  VIEW.isRename = !!renameName;
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);
  try {
    const info = await adapter.columns(s, ns, table);
    VIEW.columns = (info.cols || []).map(c => c.name);
    VIEW.error = '';
  } catch (e) {
    VIEW.columns = [];
    VIEW.error = e.message;
  }
  return w.renderView('v-indexes.ejs');
}
