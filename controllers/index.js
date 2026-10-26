export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (s) return w.doRedirect('/server');
  VIEW.title = 'Login';
  VIEW.servers = w.config.servers;
  VIEW.error = '';
  VIEW.driver = 'maria';
  VIEW.username = '';
  VIEW.db = '';
  return w.renderView('v-login.ejs');
}
