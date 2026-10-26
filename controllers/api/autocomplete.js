export default async function({ w }) {
  const s = w.m.session.current(w);
  if (!s) return w.json({ items: [] });
  const adapter = w.m[s.engine];
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.get.db || s.db || '');
  const table = w.get.table || '';
  const schema = s.engine === 'pgsql' ? (w.get.schema || s.schema || 'public') : db;
  const ns = s.engine === 'pgsql' ? schema : db;
  try {
    let items = [];
    if (!table) {
      items = (await adapter.tables(s, ns)).map(t => t.name);
    } else {
      const info = await adapter.columns(s, ns, table);
      items = info.cols.map(c => c.name);
    }
    const q = (w.get.q || '').toLowerCase();
    if (q) items = items.filter(x => String(x).toLowerCase().includes(q));
    return w.json({ items: items.slice(0, 200) });
  } catch (e) {
    return w.json({ items: [], error: e.message });
  }
}
