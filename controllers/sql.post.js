function parseSimpleSelect(sql) {
  let s = sql.trim().replace(/;+\s*$/, '');
  if (/;/.test(s)) return null;               // multiple statements
  if (!/^\s*select\b/i.test(s)) return null;  // not a SELECT
  if (/\b(join|union)\b/i.test(s)) return null;
  const m = s.match(/\bfrom\s+(`[^`]+`|"[^"]+"|[A-Za-z_][A-Za-z0-9_.]*)/i);
  if (!m) return null;
  const table = m[1].replace(/[`"]/g, '');
  const fromIdx = s.toLowerCase().indexOf('from');
  const clause = s.slice(fromIdx + 4).split(/\b(where|group|order|limit|having)\b/i)[0];
  if (/,/.test(clause)) return null;          // multiple tables
  return { table };
}

export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  if (w.post['csrf'] !== s.csrf) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.post['db'] || s.db || '');
  const schema = s.engine === 'pgsql' ? (w.post['schema'] || s.schema || 'public') : db;
  const ns = s.engine === 'pgsql' ? schema : db;
  const sql = w.post['sql'] || '';
  const explain = w.post['explain'] === '1';

  let results;
  if (explain) {
    const rows = await adapter.explain(s, ns, sql);
    results = [{ type: 'result', columns: rows[0] ? Object.keys(rows[0]) : [], rows }];
  } else {
    results = await adapter.execute(s, ns, sql);
  }

  s.history = s.history || [];
  s.history.push({ sql, time: Date.now() });
  if (s.history.length > 100) s.history = s.history.slice(-100);

  // Try to turn a single-table SELECT into a paginated, selectable grid.
  if (!explain) {
    const single = (results.length === 1 && results[0].type === 'result') ? results[0] : null;
    const parsed = single ? parseSimpleSelect(sql) : null;
    if (parsed && parsed.table) {
      try {
        const info = await adapter.columns(s, ns, parsed.table);
        const pkCols = info.pk || [];
        if (pkCols.length && pkCols.every(c => single.columns.includes(c))) {
          const cap = 5000;
          const rows = single.rows.slice(0, cap);
          s.sqlResult = {
            qid: Math.random().toString(16).slice(2),
            sql,
            columns: single.columns,
            rows,
            table: parsed.table,
            db,
            schema,
            pkCols,
            truncated: single.rows.length > cap,
          };
          return w.doRedirect('/sql');
        }
      } catch (e) { /* not a resolvable single table — fall through to inline */ }
    }
  }

  VIEW.title = 'SQL command';
  VIEW.session = s;
  VIEW.db = db;
  VIEW.schema = schema;
  VIEW.sql = sql;
  VIEW.explain = explain;
  VIEW.warn = /^\s*(drop|truncate|delete|alter|rename|create)\b/i.test(sql) ? 'This statement is destructive — it can drop, truncate or rebuild data.' : '';
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);
  results = results.map(r => {
    if (r.type !== 'result') return r;
    const truncated = r.rows.length > 1000;
    return { type: 'result', columns: r.columns, rows: r.rows.slice(0, 1000), truncated };
  });
  VIEW.results = results;
  VIEW.error = '';
  return w.renderView('v-sql.ejs');
}
