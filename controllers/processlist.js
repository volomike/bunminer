export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  VIEW.title = 'Process list';
  VIEW.session = s;
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);
  try {
    VIEW.rows = await adapter.processlist(s);
    VIEW.columns = VIEW.rows[0] ? Object.keys(VIEW.rows[0]) : [];
    VIEW.error = '';
  } catch (e) {
    VIEW.rows = [];
    VIEW.columns = [];
    VIEW.error = e.message;
  }
  return w.renderView('v-processlist.ejs');
}
