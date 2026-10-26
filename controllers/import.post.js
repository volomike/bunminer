export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  if (w.post['csrf'] !== s.csrf) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.post['db'] || s.db || '');
  const schema = s.engine === 'pgsql' ? (w.post['schema'] || s.schema || 'public') : db;

  VIEW.title = 'Import';
  VIEW.session = s;
  VIEW.db = db;
  VIEW.schema = schema;
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);

  const file = w.files && w.files.file;
  if (!file || !file.filename) {
    VIEW.error = 'No file uploaded.';
    return w.renderView('v-import.ejs');
  }
  try {
    let buf = new Uint8Array(await file.arrayBuffer());
    if (/\.gz$/i.test(file.filename)) buf = Bun.gunzipSync(buf);
    const res = await adapter.importSql(s, db, buf);
    VIEW.result = res.err || res.out || (res.code === 0 ? 'Import completed.' : 'Import finished with errors.');
    VIEW.error = '';
  } catch (e) {
    VIEW.error = e.message;
  }
  return w.renderView('v-import.ejs');
}
