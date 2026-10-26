export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  VIEW.title = 'Privileges';
  VIEW.session = s;
  VIEW.engine = s.engine;
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);
  try {
    VIEW.users = await adapter.users(s);
    VIEW.error = '';
  } catch (e) {
    VIEW.users = [];
    VIEW.error = e.message;
  }
  if (w.get.show === 'grants') {
    try {
      if (s.engine === 'maria') VIEW.grants = await adapter.grants(s, w.get.user, w.get.host);
      else VIEW.grants = await adapter.grants(s, w.get.role);
      VIEW.grantTarget = s.engine === 'maria' ? `${w.get.user}@${w.get.host}` : w.get.role;
    } catch (e) {
      VIEW.grants = null;
      VIEW.grantError = e.message;
    }
  }
  return w.renderView('v-privileges.ejs');
}
