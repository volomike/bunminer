export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = w.get.db || s.db || '';
  const schema = w.get.schema || s.schema || 'public';
  const name = w.get.name || '';
  const materialized = w.get.materialized === '1';
  const isAlter = w.get.alter === '1';
  VIEW.title = isAlter ? 'Alter view' : 'Create view';
  VIEW.session = s;
  VIEW.db = db;
  VIEW.schema = schema;
  VIEW.name = name;
  VIEW.materialized = materialized;
  VIEW.isAlter = isAlter;
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);
  VIEW.body = '';
  if (isAlter) {
    const d = await adapter.viewDef(s, schema, name);
    if (d) {
      VIEW.body = d.def;
      VIEW.materialized = d.materialized;
    }
  }
  return w.renderView('v-view.ejs');
}
