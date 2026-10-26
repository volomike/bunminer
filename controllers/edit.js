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

  VIEW.title = 'Edit';
  VIEW.session = s;
  VIEW.db = db;
  VIEW.table = table;
  VIEW.schema = schema;
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);
  VIEW.mode = 'edit';

  try {
    const info = await adapter.columns(s, ns, table);
    let pkCols = info.pk && info.pk.length ? info.pk : [];
    if (!pkCols.length && s.engine === 'sqlite') pkCols = ['rowid'];
    const pkVals = pkCols.map(c => w.get['where[' + c + ']'] ?? '');
    const row = await adapter.rowByPk(s, ns, table, pkCols, pkVals);
    if (!row) {
      VIEW.fields = [];
      VIEW.error = 'Row not found.';
      return w.renderView('v-edit.ejs');
    }
    VIEW.pk = pkCols.map((c, i) => ({ col: c, val: pkVals[i] }));
    VIEW.fields = w.m.fmt.editableCols(s.engine, info.cols).map(c => ({
      name: c.name, type: c.type, value: w.m.fmt.toInput(row[c.name]), long: w.m.fmt.isLong(c.type),
    }));
    VIEW.error = '';
  } catch (e) {
    VIEW.fields = [];
    VIEW.error = e.message;
  }
  return w.renderView('v-edit.ejs');
}
