// models/pgsql.js — PostgreSQL adapter (pg). Design A: password per session, never persisted.

import pg from 'pg';

function serverCfg(session) {
  const srv = (globalThis.w.config.servers || []).find(x => x.id === session.serverId) || {};
  return {
    host: srv.host || '127.0.0.1',
    port: srv.port || 5432,
    user: session.username || srv.user || 'postgres',
  };
}

function ident(x) { return '"' + String(x).replace(/"/g, '""') + '"'; }
function lit(x) { return "'" + String(x).replace(/'/g, "''") + "'"; }

function baseCfg(session) {
  const srv = serverCfg(session);
  const cfg = {
    host: srv.host,
    port: srv.port,
    user: srv.user,
    max: 2,
    connectionTimeoutMillis: 8000,
    application_name: 'dbxadm2',
  };
  cfg['password'] = session.dbpass || '';
  return cfg;
}

function poolFor(session) {
  if (session._pgPool) return session._pgPool;
  session._pgPool = new pg.Pool(baseCfg(session));
  return session._pgPool;
}

async function ping(session) {
  const client = new pg.Client(baseCfg(session));
  try { await client.connect(); await client.query('SELECT 1'); } finally { await client.end().catch(() => {}); }
  return true;
}

async function close(session) {
  if (session._pgPool) { await session._pgPool.end().catch(() => {}); session._pgPool = null; }
}

async function databases(session) {
  const pool = poolFor(session);
  const r = await pool.query(
    `SELECT d.datname AS name, pg_catalog.pg_get_userbyid(d.datdba) AS owner,
            pg_catalog.pg_encoding_to_char(d.encoding) AS encoding,
            pg_catalog.pg_database_size(d.datname) AS bytes
     FROM pg_catalog.pg_database d ORDER BY d.datname`
  );
  return r.rows.map(x => ({ ...x, bytes: Number(x.bytes || 0) }));
}

async function schemas(session) {
  const pool = poolFor(session);
  const r = await pool.query(
    `SELECT nspname AS name FROM pg_catalog.pg_namespace
     WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY nspname`
  );
  return r.rows.map(x => x.name);
}

const KIND = { r: 'table', p: 'partitioned table', v: 'view', m: 'materialized view', f: 'foreign table', S: 'sequence' };

async function tables(session, schema) {
  const pool = poolFor(session);
  const r = await pool.query(
    `SELECT c.relname AS name, c.relkind AS kind, c.reltuples::bigint AS rows,
            pg_catalog.pg_total_relation_size(c.oid) AS bytes, obj_description(c.oid) AS comment
     FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relkind IN ('r','p','v','m','f','S') ORDER BY c.relname`, [schema]
  );
  return r.rows.map(x => ({ ...x, bytes: Number(x.bytes || 0), kindLabel: KIND[x.kind] || x.kind }));
}

async function primaryKey(session, schema, table) {
  const pool = poolFor(session);
  const r = await pool.query(
    `SELECT a.attname AS name FROM pg_catalog.pg_index i
     JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
     JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relname = $2 AND i.indisprimary
     ORDER BY array_position(i.indkey, a.attnum)`, [schema, table]
  );
  return r.rows.map(x => x.name);
}

async function columns(session, schema, table) {
  const pool = poolFor(session);
  const qcols = await pool.query(
    `SELECT a.attname AS name, pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
            NOT a.attnotnull AS nullable,
            pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) AS def,
            a.attidentity AS identity, a.attgenerated AS generated
     FROM pg_catalog.pg_attribute a
     JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
     JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
     WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`, [schema, table]
  );
  const qidx = await pool.query(
    `SELECT i.relname AS name, ix.indisunique AS unique, ix.indisprimary AS primary,
            pg_catalog.pg_get_indexdef(i.oid) AS def
     FROM pg_catalog.pg_class t
     JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
     JOIN pg_catalog.pg_index ix ON ix.indrelid = t.oid
     JOIN pg_catalog.pg_class i ON i.oid = ix.indexrelid
     WHERE n.nspname = $1 AND t.relname = $2 ORDER BY i.relname`, [schema, table]
  );
  const qfk = await pool.query(
    `SELECT con.conname AS name, pg_catalog.pg_get_constraintdef(con.oid) AS def
     FROM pg_catalog.pg_constraint con
     JOIN pg_catalog.pg_class t ON t.oid = con.conrelid
     JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = $1 AND t.relname = $2 AND con.contype = 'f'`, [schema, table]
  );
  const qddl = await pool.query(`SELECT pg_catalog.pg_get_tabledef(${lit(schema)} || '.' || ${lit(table)}) AS ddl`);
  return {
    cols: qcols.rows,
    indexes: qidx.rows,
    fks: qfk.rows,
    createSql: (qddl.rows[0] && qddl.rows[0].ddl) || '',
    pk: await primaryKey(session, schema, table),
  };
}

async function rows(session, schema, table, o = {}) {
  const pool = poolFor(session);
  const where = (o.where || '').trim();
  const order = (o.order || '').trim();
  const limit = Math.min(Math.max(parseInt(o.limit, 10) || 30, 1), 1000);
  const offset = Math.max(parseInt(o.offset, 10) || 0, 0);
  const t = `${ident(schema)}.${ident(table)}`;
  const wh = where ? ` WHERE ${where}` : '';
  const ord = order ? ` ORDER BY ${order}` : '';
  const r = await pool.query(`SELECT * FROM ${t}${wh}${ord} LIMIT ${limit} OFFSET ${offset}`);
  const c = await pool.query(`SELECT COUNT(*) AS n FROM ${t}${wh}`);
  return { rows: r.rows, total: Number(c.rows[0].n) };
}

async function rowByPk(session, schema, table, pkCols, pkVals) {
  const pool = poolFor(session);
  const t = `${ident(schema)}.${ident(table)}`;
  const wh = pkCols.map(c => `${ident(c)} = $${pkCols.indexOf(c) + 1}`).join(' AND ');
  const r = await pool.query(`SELECT * FROM ${t} WHERE ${wh} LIMIT 1`, pkVals);
  return r.rows[0] || null;
}

function colsToPlaceholders(keys, start) {
  return keys.map((k, i) => `$${start + i}`);
}

async function insert(session, schema, table, values) {
  const pool = poolFor(session);
  const keys = Object.keys(values);
  const t = `${ident(schema)}.${ident(table)}`;
  const sql = `INSERT INTO ${t} (${keys.map(ident).join(', ')}) VALUES (${colsToPlaceholders(keys, 1).join(', ')})`;
  const r = await pool.query(sql, keys.map(k => values[k]));
  return r;
}

async function update(session, schema, table, values, pkCols, pkVals) {
  const pool = poolFor(session);
  const keys = Object.keys(values);
  const t = `${ident(schema)}.${ident(table)}`;
  const set = keys.map((k, i) => `${ident(k)} = $${i + 1}`).join(', ');
  const wh = pkCols.map((c, i) => `${ident(c)} = $${keys.length + i + 1}`).join(' AND ');
  const sql = `UPDATE ${t} SET ${set} WHERE ${wh}`;
  const r = await pool.query(sql, [...keys.map(k => values[k]), ...pkVals]);
  return r;
}

async function remove(session, schema, table, pkCols, pkVals) {
  const pool = poolFor(session);
  const t = `${ident(schema)}.${ident(table)}`;
  const wh = pkCols.map((c, i) => `${ident(c)} = $${i + 1}`).join(' AND ');
  const r = await pool.query(`DELETE FROM ${t} WHERE ${wh}`, pkVals);
  return r;
}

async function execute(session, schema, sql) {
  const client = new pg.Client(Object.assign({}, baseCfg(session)));
  await client.connect();
  try {
    if (schema) await client.query(`SET search_path TO ${ident(schema)}, public`);
    const res = await client.query(sql);
    const list = Array.isArray(res) ? res : [res];
    return list.map(r => {
      if (r.fields) return { type: 'result', columns: r.fields.map(f => f.name), rows: r.rows || [] };
      return { type: 'ok', command: r.command, rowCount: r.rowCount };
    });
  } finally {
    await client.end().catch(() => {});
  }
}

async function explain(session, schema, sql) {
  const pool = poolFor(session);
  const r = await pool.query(`EXPLAIN ${sql}`);
  return r.rows.map(x => x['QUERY PLAN'] || JSON.stringify(x));
}

async function processlist(session) {
  const pool = poolFor(session);
  const r = await pool.query(
    `SELECT pid, usename, datname, state, query, backend_start FROM pg_catalog.pg_stat_activity ORDER BY pid`
  );
  return r.rows;
}

async function kill(session, pid) {
  const pool = poolFor(session);
  await pool.query('SELECT pg_catalog.pg_terminate_backend($1)', [parseInt(pid, 10)]);
}

async function variables(session) {
  const pool = poolFor(session);
  const r = await pool.query(`SELECT name, setting, unit, context FROM pg_catalog.pg_settings ORDER BY name`);
  return r.rows;
}

async function status(session) {
  const pool = poolFor(session);
  const r = await pool.query(
    `SELECT datname, numbackends, xact_commit, xact_rollback, blks_read, blks_hit, deadlocks
     FROM pg_catalog.pg_stat_database ORDER BY datname`
  );
  return r.rows;
}

async function users(session) {
  const pool = poolFor(session);
  const r = await pool.query(
    `SELECT rolname AS name, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin, rolreplication, rolconnlimit, rolvaliduntil
     FROM pg_catalog.pg_roles ORDER BY rolname`
  );
  return r.rows;
}

async function grants(session, role) {
  const pool = poolFor(session);
  const r = await pool.query(
    `SELECT grantee, table_schema, table_name, privilege_type
     FROM information_schema.role_table_grants WHERE grantee = $1 ORDER BY table_schema, table_name, privilege_type`, [role]
  );
  return r.rows;
}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

async function createRole(session, name, pass, opts) {
  if (!NAME_RE.test(name)) throw new Error('Invalid role name');
  const pool = poolFor(session);
  const flags = [opts.superuser ? 'SUPERUSER' : 'NOSUPERUSER', opts.createdb ? 'CREATEDB' : 'NOCREATEDB', opts.login ? 'LOGIN' : 'NOLOGIN'];
  await pool.query(`CREATE ROLE ${ident(name)} ${flags.join(' ')} PASSWORD ${lit(pass)}`);
}

async function dropRole(session, name) {
  if (!NAME_RE.test(name)) throw new Error('Invalid role name');
  const pool = poolFor(session);
  await pool.query(`DROP ROLE ${ident(name)}`);
}

async function alterRole(session, name, pass) {
  if (!NAME_RE.test(name)) throw new Error('Invalid role name');
  const pool = poolFor(session);
  await pool.query(`ALTER ROLE ${ident(name)} PASSWORD ${lit(pass)}`);
}

async function grant(session, role, privs, scope) {
  if (!NAME_RE.test(role)) throw new Error('Invalid role name');
  if (!/^[A-Za-z, ]+$/.test(privs)) throw new Error('Invalid privileges');
  if (!/^[A-Za-z_*".]+$/.test(scope)) throw new Error('Invalid scope');
  const pool = poolFor(session);
  await pool.query(`GRANT ${privs} ON ${scope} TO ${ident(role)}`);
}

async function revoke(session, role, privs, scope) {
  if (!NAME_RE.test(role)) throw new Error('Invalid role name');
  if (!/^[A-Za-z, ]+$/.test(privs)) throw new Error('Invalid privileges');
  if (!/^[A-Za-z_*".]+$/.test(scope)) throw new Error('Invalid scope');
  const pool = poolFor(session);
  await pool.query(`REVOKE ${privs} ON ${scope} FROM ${ident(role)}`);
}

async function dump(session, db, opts) {
  const srv = serverCfg(session);
  const args = ['pg_dump', '-h', String(srv.host), '-p', String(srv.port), '-U', srv.user, '--format=plain', '--clean', '--if-exists'];
  if (opts.structureOnly) args.push('--schema-only');
  if (opts.dataOnly) args.push('--data-only');
  if (opts.schema) args.push('-n', opts.schema);
  if (opts.table) args.push('-t', opts.table);
  args.push(db);
  const env = { PATH: process.env.PATH || '' };
  env['PGPASSWORD'] = session.dbpass || '';
  const proc = Bun.spawn({ cmd: args, env, stdout: 'pipe', stderr: 'pipe' });
  const out = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
  const err = await new Response(proc.stderr).text();
  const code = await proc.exited;
  if (code !== 0) throw new Error(err || `pg_dump exited ${code}`);
  return out;
}

async function importSql(session, db, buf) {
  const srv = serverCfg(session);
  const args = ['psql', '-h', String(srv.host), '-p', String(srv.port), '-U', srv.user, '-d', db, '-f', '-', '-v', 'ON_ERROR_STOP=0'];
  const env = { PATH: process.env.PATH || '' };
  env['PGPASSWORD'] = session.dbpass || '';
  const proc = Bun.spawn({ cmd: args, env, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
  await proc.stdin.write(buf);
  await proc.stdin.end();
  const err = await new Response(proc.stderr).text();
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  return { code, err, out };
}

async function blob(session, schema, table, col, pkCols, pkVals) {
  const pool = poolFor(session);
  const t = `${ident(schema)}.${ident(table)}`;
  const wh = pkCols.map((c, i) => `${ident(c)} = $${i + 1}`).join(' AND ');
  const r = await pool.query(`SELECT ${ident(col)} AS val FROM ${t} WHERE ${wh} LIMIT 1`, pkVals);
  return r.rows[0] ? r.rows[0].val : null;
}

async function dropTable(session, schema, table, kind) {
  const pool = poolFor(session);
  const k = kind === 'view' ? 'VIEW' : kind === 'materialized view' ? 'MATERIALIZED VIEW' : 'TABLE';
  await pool.query(`DROP ${k} ${ident(schema)}.${ident(table)}`);
}

async function truncate(session, schema, table) {
  const pool = poolFor(session);
  await pool.query(`TRUNCATE TABLE ${ident(schema)}.${ident(table)}`);
}

function dumpVal(x) {
  if (x === null || x === undefined) return 'NULL';
  if (typeof x === 'number') return String(x);
  if (typeof x === 'bigint') return String(x);
  if (typeof x === 'boolean') return x ? 'TRUE' : 'FALSE';
  if (Buffer.isBuffer(x) || x instanceof Uint8Array) { const b = Buffer.from(x); return `'\\x${b.toString('hex')}'`; }
  if (typeof x === 'object') return lit(JSON.stringify(x));
  return lit(String(x));
}

async function exportRows(session, schema, table, pkCols, pkRows) {
  const pool = poolFor(session);
  if (!pkRows.length) return new TextEncoder().encode('');
  const t = `${ident(schema)}.${ident(table)}`;
  const colList = pkCols.map(ident).join(', ');
  let n = 0;
  const placeholders = pkRows.map(() => '(' + pkCols.map(() => '$' + (++n)).join(',') + ')').join(',');
  const flat = [].concat(...pkRows);
  const res = await pool.query(`SELECT * FROM ${t} WHERE (${colList}) IN (${placeholders})`, flat);
  const rows = res.rows;
  if (!rows.length) return new TextEncoder().encode('');
  const cols = Object.keys(rows[0]);
  const lines = rows.map(r => `INSERT INTO ${t} (${cols.map(ident).join(', ')}) VALUES (${cols.map(c => dumpVal(r[c])).join(', ')});`);
  return new TextEncoder().encode(lines.join('\n') + '\n');
}

function defLit(d) {
  const s = String(d).trim();
  if (/^null$/i.test(s)) return 'NULL';
  if (/^(current_timestamp|now\(\)|current_date|current_time|true|false)$/i.test(s)) return s;
  if (/^nextval\(/i.test(s)) return s;
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  return lit(s);
}

function colDef(c) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(c.name)) throw new Error('Invalid column name');
  if (!/^[A-Za-z0-9 _(),.'"\[\]]+$/.test(c.type)) throw new Error('Invalid column type');
  const len = c.length && /^[\d,]{1,12}$/.test(c.length) ? `(${c.length})` : '';
  let s = `${ident(c.name)} ${c.type}${len}`;
  s += c.nullable === false ? ' NOT NULL' : '';
  if (c.def !== undefined && c.def !== null && c.def !== '') s += ` DEFAULT ${defLit(c.def)}`;
  return s;
}

async function createTable(session, schema, name, cols) {
  const pool = poolFor(session);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Invalid table name');
  const sql = `CREATE TABLE ${ident(schema)}.${ident(name)} (${cols.map(colDef).join(', ')})`;
  await pool.query(sql);
  return { sql };
}

async function addColumn(session, schema, table, c) {
  const pool = poolFor(session);
  const t = `${ident(schema)}.${ident(table)}`;
  await pool.query(`ALTER TABLE ${t} ADD COLUMN ${colDef(c)}`);
}

async function dropColumn(session, schema, table, colName) {
  const pool = poolFor(session);
  const t = `${ident(schema)}.${ident(table)}`;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(colName)) throw new Error('Invalid column name');
  await pool.query(`ALTER TABLE ${t} DROP COLUMN ${ident(colName)}`);
}

async function editColumn(session, schema, table, oldName, c) {
  const pool = poolFor(session);
  const t = `${ident(schema)}.${ident(table)}`;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(oldName)) throw new Error('Invalid column name');
  if (c.type && !/^[A-Za-z0-9 _(),.'"\[\]]+$/.test(c.type)) throw new Error('Invalid column type');
  const stmts = [];
  if (c.name && c.name !== oldName) stmts.push(`ALTER TABLE ${t} RENAME COLUMN ${ident(oldName)} TO ${ident(c.name)}`);
  const n = c.name || oldName;
  if (c.type) stmts.push(`ALTER TABLE ${t} ALTER COLUMN ${ident(n)} TYPE ${c.type}`);
  stmts.push(`ALTER TABLE ${t} ALTER COLUMN ${ident(n)} ${c.nullable === false ? 'SET NOT NULL' : 'DROP NOT NULL'}`);
  if (c.def !== undefined && c.def !== null && c.def !== '') stmts.push(`ALTER TABLE ${t} ALTER COLUMN ${ident(n)} SET DEFAULT ${defLit(c.def)}`);
  else stmts.push(`ALTER TABLE ${t} ALTER COLUMN ${ident(n)} DROP DEFAULT`);
  for (const s of stmts) await pool.query(s);
}

async function createIndex(session, schema, table, name, columns, unique) {
  const pool = poolFor(session);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Invalid index name');
  if (!columns.length) throw new Error('Specify at least one column');
  const cols = columns.map(c => ident(c)).join(', ');
  await pool.query(`CREATE ${unique ? 'UNIQUE ' : ''}INDEX ${ident(name)} ON ${ident(schema)}.${ident(table)} (${cols})`);
}

async function dropIndex(session, schema, table, name) {
  const pool = poolFor(session);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Invalid index name');
  await pool.query(`DROP INDEX ${ident(schema)}.${ident(name)}`);
}

async function renameIndex(session, schema, table, oldName, newName) {
  const pool = poolFor(session);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(oldName) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(newName)) throw new Error('Invalid index name');
  await pool.query(`ALTER INDEX ${ident(schema)}.${ident(oldName)} RENAME TO ${ident(newName)}`);
}

export default {
  ping, close, databases, schemas, tables, primaryKey, columns, rows, rowByPk, insert, update, remove,
  execute, explain, processlist, kill, variables, status, users, grants,
  createRole, dropRole, alterRole, grant, revoke, dump, importSql, blob, dropTable, truncate, exportRows,
  createTable, addColumn, dropColumn, editColumn,
  createIndex, dropIndex, renameIndex,
};
