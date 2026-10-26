const TYPES = {
  maria: ['INT', 'BIGINT', 'TINYINT', 'SMALLINT', 'VARCHAR', 'CHAR', 'TEXT', 'LONGTEXT', 'DATETIME', 'DATE', 'TIME', 'TIMESTAMP', 'DECIMAL', 'FLOAT', 'DOUBLE', 'BOOLEAN', 'JSON', 'ENUM', 'SET', 'BLOB'],
  pgsql: ['INTEGER', 'BIGINT', 'SMALLINT', 'SERIAL', 'BIGSERIAL', 'VARCHAR', 'TEXT', 'TIMESTAMPTZ', 'TIMESTAMP', 'DATE', 'TIME', 'NUMERIC', 'REAL', 'DOUBLE PRECISION', 'BOOLEAN', 'JSONB', 'JSON', 'UUID', 'BYTEA'],
  sqlite: ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC', 'DATETIME', 'BOOLEAN', 'VARCHAR'],
};

export default async function({ w, VIEW }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  const db = s.engine === 'sqlite' ? (s.db || '') : (w.get.db || s.db || '');
  if (!db) return w.doRedirect('/server');
  const schema = s.engine === 'pgsql' ? (w.get.schema || s.schema || 'public') : db;
  VIEW.title = 'Create table';
  VIEW.session = s;
  VIEW.db = db;
  VIEW.schema = schema;
  VIEW.q = (path, o) => w.m.fmt.url(s, path, o);
  VIEW.types = TYPES[s.engine] || [];
  VIEW.error = '';
  return w.renderView('v-create.ejs');
}
