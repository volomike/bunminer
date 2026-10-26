const TYPES = {
  maria: ['INT', 'BIGINT', 'TINYINT', 'SMALLINT', 'VARCHAR', 'CHAR', 'TEXT', 'LONGTEXT', 'DATETIME', 'DATE', 'TIME', 'TIMESTAMP', 'DECIMAL', 'FLOAT', 'DOUBLE', 'BOOLEAN', 'JSON', 'ENUM', 'SET', 'BLOB'],
  pgsql: ['INTEGER', 'BIGINT', 'SMALLINT', 'SERIAL', 'BIGSERIAL', 'VARCHAR', 'TEXT', 'TIMESTAMPTZ', 'TIMESTAMP', 'DATE', 'TIME', 'NUMERIC', 'REAL', 'DOUBLE PRECISION', 'BOOLEAN', 'JSONB', 'JSON', 'UUID', 'BYTEA'],
  sqlite: ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC', 'DATETIME', 'BOOLEAN', 'VARCHAR'],
};

function parseType(t) {
  let type = String(t || '').trim();
  let unsigned = false;
  if (/\bunsigned\b/i.test(type)) { unsigned = true; type = type.replace(/\s*unsigned\b/i, ''); }
  let length = '';
  const m = type.match(/^(.*?)\s*\(([^)]*)\)$/);
  if (m) { type = m[1].trim(); length = m[2].trim(); }
  return { type, length, unsigned };
}

export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.get.db || s.db || '');
  const table = w.get.table || '';
  if (!db || !table) return w.doRedirect('/server');
  const schema = s.engine === 'pgsql' ? (w.get.schema || s.schema || 'public') : db;
  const ns = s.engine === 'pgsql' ? schema : db;
  const column = w.get.column || '';

  VIEW.title = column ? 'Edit column' : 'Add column';
  VIEW.session = s;
  VIEW.db = db;
  VIEW.table = table;
  VIEW.schema = schema;
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);
  VIEW.types = TYPES[s.engine] || [];
  VIEW.isNew = !column;

  try {
    const info = await adapter.columns(s, ns, table);
    if (column) {
      const c = info.cols.find(x => x.name === column);
      if (!c) throw new Error('Column not found: ' + column);
      const p = parseType(c.type);
      const nullable = (typeof c.nullable === 'boolean') ? c.nullable : String(c.nullable).toLowerCase() !== 'no';
      const autoInc = (c.extra || '').toLowerCase().includes('auto_increment');
      VIEW.col = {
        name: c.name,
        type: p.type,
        length: p.length,
        unsigned: p.unsigned,
        nullable,
        autoInc,
        def: c.def === null || c.def === undefined ? '' : String(c.def),
        serial: /\bnextval\b/i.test(String(c.def || '')) || !!c.identity,
      };
    } else {
      VIEW.col = { name: '', type: '', length: '', unsigned: false, nullable: true, autoInc: false, def: '', serial: false };
    }
    VIEW.error = '';
  } catch (e) {
    VIEW.error = e.message;
    VIEW.col = null;
  }
  return w.renderView('v-alter-column.ejs');
}
