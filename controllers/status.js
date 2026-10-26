export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  VIEW.title = 'Status';
  VIEW.session = s;
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);
  VIEW.kind = 'status';
  try {
    if (s.engine === 'pgsql') {
      const rows = await adapter.status(s);
      VIEW.rows = rows.flatMap(d => Object.entries(d).map(([k, v]) => ({ name: (d.datname ? d.datname + '.' : '') + k, value: v })));
    } else {
      VIEW.rows = await adapter.status(s);
    }
    VIEW.error = '';
  } catch (e) {
    VIEW.rows = [];
    VIEW.error = e.message;
  }
  return w.renderView('v-variables.ejs');
}
