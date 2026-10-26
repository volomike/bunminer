export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  VIEW.title = 'Server';
  VIEW.session = s;
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);
  try {
    VIEW.dbs = await adapter.databases(s);
    VIEW.error = '';
  } catch (e) {
    VIEW.dbs = [];
    VIEW.error = e.message;
  }
  return w.renderView('v-server.ejs');
}
