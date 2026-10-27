const ALLOWED_LIMITS = [5, 10, 15, 20, 25, 30, 35, 50, 100, 150, 200, 500, 1000];

export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.get.db || s.db || '');
  if (!db) return w.doRedirect('/server');
  const schema = s.engine === 'pgsql' ? (w.get.schema || s.schema || 'public') : db;

  VIEW.title = 'SQL command';
  VIEW.session = s;
  VIEW.db = db;
  VIEW.schema = schema;
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);
  VIEW.warn = '';

  const res = s.sqlResult;
  if (res && !w.get.sql) {
    const limit = Math.min(Math.max(parseInt(w.get.limit, 10) || 15, 1), 1000);
    const offset = Math.max(parseInt(w.get.offset, 10) || 0, 0);
    VIEW.sql = res.sql;
    VIEW.warn = /^\s*(drop|truncate|delete|alter|rename|create)\b/i.test(res.sql) ? 'This statement is destructive — it can drop, truncate or rebuild data.' : '';
    VIEW.grid = res;
    VIEW.columns = res.columns;
    VIEW.total = res.rows.length;
    VIEW.limit = limit;
    VIEW.offset = offset;
    VIEW.limitOptions = ALLOWED_LIMITS;
    VIEW.selKey = 'dbxadm2.sqsel.' + res.qid;
    const back = '/sql?' + new URLSearchParams({ limit: String(limit), offset: String(offset) }).toString();
    VIEW.rows = res.rows.slice(offset, offset + limit).map(r => {
      const keyParams = new URLSearchParams();
      const editObj = { db: res.db, table: res.table, schema: res.schema };
      for (const c of res.pkCols) {
        keyParams.append(c, String(r[c]));
        editObj['where[' + c + ']'] = r[c];
      }
      editObj['back'] = back;
      return {
        cells: res.columns.map(c => w.m.fmt.cell(r[c])),
        key: keyParams.toString(),
        editUrl: w.m.fmt.url(s, '/edit', editObj),
      };
    });
    VIEW.results = null;
    VIEW.error = '';
    return w.renderView('v-sql.ejs');
  }

  VIEW.sql = w.get.sql || '';
  VIEW.warn = /^\s*(drop|truncate|delete|alter|rename|create)\b/i.test(VIEW.sql) ? 'This statement is destructive — it can drop, truncate or rebuild data.' : '';
  VIEW.results = null;
  VIEW.error = '';
  return w.renderView('v-sql.ejs');
}
