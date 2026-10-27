const ALLOWED_LIMITS = [5, 10, 15, 20, 25, 30, 35, 50, 100, 150, 200, 500, 1000];

export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.get.db || s.db || '');
  const table = w.get.table || '';
  if (!db || !table) return w.doRedirect('/server');
  if (s.engine !== 'sqlite') s.db = db;
  const schema = s.engine === 'pgsql' ? (w.get.schema || s.schema || 'public') : db;
  if (s.engine === 'pgsql') s.schema = schema;
  const ns = s.engine === 'pgsql' ? schema : db;

  const where = w.get.where || '';
  const order = w.get.order || '';
  const limit = Math.min(Math.max(parseInt(w.get.limit, 10) || 15, 1), 1000);
  const offset = Math.max(parseInt(w.get.offset, 10) || 0, 0);

  VIEW.title = 'Select';
  VIEW.session = s;
  VIEW.db = db;
  VIEW.table = table;
  VIEW.schema = schema;
  VIEW.where = where;
  VIEW.order = order;
  VIEW.limit = limit;
  VIEW.offset = offset;
  VIEW.limitOptions = ALLOWED_LIMITS;
  VIEW.selKey = 'dbxadm2.sel.' + encodeURIComponent(db + '|' + table);
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);

  // sort state for column headers (first column + direction of the ORDER BY value)
  let sortCol = null;
  let sortDir = null;
  const ot = order.trim();
  if (ot) {
    const m = ot.split(',')[0].trim().match(/^(`[^`]*`|"[^"]*"|[^\s]+)(?:\s+(asc|desc))?/i);
    if (m) {
      sortCol = m[1].replace(/[`"]/g, '');
      sortDir = String(m[2] || 'asc').toLowerCase();
    }
  }
  VIEW.sortCol = sortCol;
  VIEW.sortDir = sortDir;
  VIEW.quoteIdent = (x) => s.engine === 'maria' ? '`' + String(x).replace(/`/g, '``') + '`' : '"' + String(x).replace(/"/g, '""') + '"';
  VIEW.sortOrderFor = (c) => (s.engine === 'pgsql' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(c) ? VIEW.quoteIdent(c) : c);

  try {
    const info = await adapter.columns(s, ns, table);
    const data = await adapter.rows(s, ns, table, { where, order, limit, offset });
    let pkCols = info.pk && info.pk.length ? info.pk : [];
    if (!pkCols.length && s.engine === 'sqlite' && data.useRowid) pkCols = ['rowid'];
    const columns = (info.cols || []).map(c => c.name);
    const rows = data.rows.map(r => {
      const pk = [];
      let selectable = true;
      for (const c of pkCols) {
        if (r[c] === undefined || r[c] === null) { selectable = false; break; }
        pk.push({ col: c, val: r[c] });
      }
      const editObj = { db, table, schema };
      const keyParams = new URLSearchParams();
      for (const p of pk) { keyParams.append(p.col, String(p.val)); editObj['where[' + p.col + ']'] = p.val; }
      return {
        cells: columns.map(c => w.m.fmt.cell(r[c])),
        editUrl: selectable ? w.m.fmt.url(s, '/edit', editObj) : null,
        key: keyParams.toString(),
        selectable,
      };
    });
    VIEW.columns = columns;
    VIEW.rows = rows;
    VIEW.total = data.total;
    VIEW.error = '';
  } catch (e) {
    VIEW.columns = [];
    VIEW.rows = [];
    VIEW.total = 0;
    VIEW.error = e.message;
  }
  return w.renderView('v-select.ejs');
}
