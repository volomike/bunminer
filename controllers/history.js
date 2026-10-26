export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  VIEW.title = 'History';
  VIEW.session = s;
  VIEW.db = s.db;
  VIEW.history = (s.history || []).slice().reverse();
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);
  return w.renderView('v-history.ejs');
}
