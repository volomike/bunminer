export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = w.get.db || s.db || '';
  const schema = w.get.schema || s.schema || 'public';
  const name = w.get.name || '';
  VIEW.title = 'Sequence';
  VIEW.session = s;
  VIEW.db = db;
  VIEW.schema = schema;
  VIEW.name = name;
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);
  try {
    VIEW.seq = await adapter.sequenceInfo(s, schema, name);
    VIEW.error = '';
  } catch (e) {
    VIEW.seq = null;
    VIEW.error = e.message;
  }
  return w.renderView('v-sequence.ejs');
}
