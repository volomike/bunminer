const TYPES = {
  maria: ['INT', 'TINYINT', 'SMALLINT', 'MEDIUMINT', 'INTEGER', 'BIGINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'DOUBLE PRECISION', 'REAL', 'BIT', 'BOOLEAN', 'BOOL', 'DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'YEAR', 'CHAR', 'VARCHAR', 'BINARY', 'VARBINARY', 'TINYBLOB', 'BLOB', 'MEDIUMBLOB', 'LONGBLOB', 'TINYTEXT', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT', 'JSON', 'UUID', 'INET4', 'INET6', 'POINT', 'LINESTRING', 'POLYGON', 'GEOMETRY'],
  pgsql: ['integer', 'bigint', 'smallint', 'serial', 'bigserial', 'smallserial', 'numeric', 'decimal', 'real', 'double precision', 'money', 'character varying', 'varchar', 'character', 'char', 'text', 'bytea', 'date', 'time', 'time with time zone', 'timestamp', 'timestamp with time zone', 'interval', 'boolean', 'json', 'jsonb', 'uuid', 'xml', 'inet', 'cidr', 'macaddr', 'macaddr8', 'bit', 'bit varying', 'tsvector', 'tsquery', 'integer[]', 'bigint[]', 'text[]', 'character varying[]', 'numeric[]', 'boolean[]', 'uuid[]', 'jsonb[]'],
  sqlite: ['INTEGER', 'BIGINT', 'TEXT', 'REAL', 'BLOB', 'NUMERIC', 'BOOLEAN', 'DATETIME', 'DATE', 'TIME', 'VARCHAR', 'CHAR', 'FLOAT', 'DOUBLE', 'DECIMAL', 'JSON'],
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
