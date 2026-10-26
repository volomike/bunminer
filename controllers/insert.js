function fieldValues(post) {
  const out = {};
  for (const [k, v] of Object.entries(post)) {
    const m = k.match(/^f\[(.*)\]$/);
    if (m) out[m[1]] = (v === '' || v === undefined || v === null) ? null : v;
  }
  return out;
}

export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.get.db || s.db || '');
  const table = w.get.table || '';
  if (!db || !table) return w.doRedirect('/server');
  if (s.engine !== 'sqlite') s.db = db;
  const schema = s.engine === 'pgsql' ? (w.get.schema || s.schema || 'public') : db;
  const ns = s.engine === 'pgsql' ? schema : db;

  VIEW.title = 'New item';
  VIEW.session = s;
  VIEW.db = db;
  VIEW.table = table;
  VIEW.schema = schema;
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);
  VIEW.mode = 'insert';

  try {
    const info = await adapter.columns(s, ns, table);
    VIEW.fields = w.m.fmt.editableCols(s.engine, info.cols).map(c => ({
      name: c.name, type: c.type, value: '', long: w.m.fmt.isLong(c.type),
    }));
    VIEW.error = '';
  } catch (e) {
    VIEW.fields = [];
    VIEW.error = e.message;
  }
  return w.renderView('v-edit.ejs');
}
