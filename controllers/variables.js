export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  VIEW.title = 'Variables';
  VIEW.session = s;
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);
  VIEW.kind = 'variables';
  try {
    if (s.engine === 'pgsql') {
      VIEW.rows = (await adapter.variables(s)).map(x => ({ name: x.name, value: (x.setting ?? '') + (x.unit ? ' ' + x.unit : '') }));
    } else {
      VIEW.rows = await adapter.variables(s);
    }
    VIEW.error = '';
  } catch (e) {
    VIEW.rows = [];
    VIEW.error = e.message;
  }
  return w.renderView('v-variables.ejs');
}
