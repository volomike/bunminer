// models/maria.js — MariaDB adapter (mysql2). Design A: password passed per session, never persisted.

import mysql from 'mysql2/promise';

function serverCfg(session) {
  const srv = (globalThis.w.config.servers || []).find(x => x.id === session.serverId) || {};
  return {
    host: srv.host || '127.0.0.1',
    port: srv.port || 3306,
    user: session.username || srv.user || 'root',
  };
}

function ident(x) { return '`' + String(x).replace(/`/g, '``') + '`'; }
function q(x) { return "'" + String(x).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'"; }

function baseCfg(session) {
  const srv = serverCfg(session);
  const cfg = {
    host: srv.host,
    port: srv.port,
    user: srv.user,
    charset: 'utf8mb4',
    dateStrings: true,
    connectTimeout: 8000,
    supportBigNumbers: true,
    bigNumberStrings: true,
  };
  cfg['password'] = session.dbpass || '';
  return cfg;
}

function poolFor(session) {
  if (session._mariaPool) return session._mariaPool;
  const cfg = Object.assign({ connectionLimit: 2 }, baseCfg(session));
  session._mariaPool = mysql.createPool(cfg);
  return session._mariaPool;
}

async function ping(session) {
  const conn = await mysql.createConnection(baseCfg(session));
  try { await conn.query('SELECT 1'); } finally { await conn.end(); }
  return true;
}

async function close(session) {
  if (session._mariaPool) {
    await session._mariaPool.end().catch(() => {});
    session._mariaPool = null;
  }
}

async function databases(session) {
  const pool = poolFor(session);
  const [rows] = await pool.query(
    `SELECT table_schema AS name, ROUND(SUM(data_length + index_length)) AS bytes, COUNT(*) AS tables
     FROM information_schema.TABLES GROUP BY table_schema ORDER BY table_schema`
  );
  const sys = new Set(['information_schema', 'performance_schema', 'mysql', 'sys']);
  return rows
    .filter(r => !sys.has(r.name))
    .map(r => ({ name: r.name, bytes: Number(r.bytes || 0), tables: Number(r.tables || 0) }));
}

async function tables(session, db) {
  const pool = poolFor(session);
  const [rows] = await pool.query(
    `SELECT TABLE_NAME AS name, TABLE_TYPE AS table_type, ENGINE, TABLE_ROWS AS row_count,
            DATA_LENGTH + INDEX_LENGTH AS bytes, TABLE_COLLATION AS collation, TABLE_COMMENT AS comment
     FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`, [db]
  );
  return rows.map(r => ({
    name: r.name,
    type: r.table_type,
    ENGINE: r.ENGINE,
    rows: Number(r.row_count || 0),
    bytes: Number(r.bytes || 0),
    collation: r.collation,
    comment: r.comment,
  }));
}

async function primaryKey(session, db, table) {
  const pool = poolFor(session);
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME AS name FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION`, [db, table]
  );
  return rows.map(r => r.name);
}

async function columns(session, db, table) {
  const pool = poolFor(session);
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS col_type, IS_NULLABLE AS nullable,
            COLUMN_DEFAULT AS def, EXTRA AS extra, COLUMN_COMMENT AS comment
     FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`, [db, table]
  );
  const [idx] = await pool.query(`SHOW INDEX FROM ${ident(db)}.${ident(table)}`);
  const [fk] = await pool.query(
    `SELECT k.CONSTRAINT_NAME AS name, k.COLUMN_NAME AS col, k.REFERENCED_TABLE_NAME AS refTable,
            k.REFERENCED_COLUMN_NAME AS refCol, r.UPDATE_RULE AS onUpdate, r.DELETE_RULE AS onDelete
     FROM information_schema.KEY_COLUMN_USAGE k
     JOIN information_schema.REFERENTIAL_CONSTRAINTS r
       ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
     WHERE k.TABLE_SCHEMA = ? AND k.TABLE_NAME = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL`, [db, table]
  );
  const [ddl] = await pool.query(`SHOW CREATE TABLE ${ident(db)}.${ident(table)}`);
  return {
    cols: cols.map(c => ({ name: c.name, type: c.col_type, nullable: c.nullable, def: c.def, extra: c.extra, comment: c.comment })),
    indexes: idx,
    fks: fk,
    createSql: ddl[0] ? Object.values(ddl[0])[1] : '',
    pk: await primaryKey(session, db, table),
  };
}

async function rows(session, db, table, o = {}) {
  const pool = poolFor(session);
  const where = (o.where || '').trim();
  const order = (o.order || '').trim();
  const limit = Math.min(Math.max(parseInt(o.limit, 10) || 30, 1), 1000);
  const offset = Math.max(parseInt(o.offset, 10) || 0, 0);
  const wh = where ? ` WHERE ${where}` : '';
  const ord = order ? ` ORDER BY ${order}` : '';
  const [r] = await pool.query(`SELECT * FROM ${ident(db)}.${ident(table)}${wh}${ord} LIMIT ${limit} OFFSET ${offset}`);
  const [c] = await pool.query(`SELECT COUNT(*) AS n FROM ${ident(db)}.${ident(table)}${wh}`);
  return { rows: r, total: Number(c[0].n) };
}

async function rowByPk(session, db, table, pkCols, pkVals) {
  const pool = poolFor(session);
  const wh = pkCols.map(c => `${ident(c)} = ?`).join(' AND ');
  const [r] = await pool.query(`SELECT * FROM ${ident(db)}.${ident(table)} WHERE ${wh} LIMIT 1`, pkVals);
  return r[0] || null;
}

async function insert(session, db, table, values) {
  const pool = poolFor(session);
  const keys = Object.keys(values);
  const sql = `INSERT INTO ${ident(db)}.${ident(table)} (${keys.map(ident).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
  const [res] = await pool.query(sql, keys.map(k => values[k]));
  return res;
}

async function update(session, db, table, values, pkCols, pkVals) {
  const pool = poolFor(session);
  const keys = Object.keys(values);
  const set = keys.map(k => `${ident(k)} = ?`).join(', ');
  const wh = pkCols.map(c => `${ident(c)} = ?`).join(' AND ');
  const sql = `UPDATE ${ident(db)}.${ident(table)} SET ${set} WHERE ${wh}`;
  const [res] = await pool.query(sql, [...keys.map(k => values[k]), ...pkVals]);
  return res;
}

async function remove(session, db, table, pkCols, pkVals) {
  const pool = poolFor(session);
  const wh = pkCols.map(c => `${ident(c)} = ?`).join(' AND ');
  const [res] = await pool.query(`DELETE FROM ${ident(db)}.${ident(table)} WHERE ${wh}`, pkVals);
  return res;
}

async function execute(session, db, sql) {
  const cfg = Object.assign({ database: db, multipleStatements: true }, baseCfg(session));
  const conn = await mysql.createConnection(cfg);
  try {
    const [results] = await conn.query(sql);
    const list = Array.isArray(results) ? results : [results];
    return list.map(res => {
      if (Array.isArray(res)) {
        const [rows, fields] = res;
        const columns = (fields && fields.map(f => f.name)) || Object.keys(rows[0] || {});
        return { type: 'result', columns, rows: rows || [] };
      }
      return { type: 'ok', affectedRows: res.affectedRows, info: res.info || res.message || '' };
    });
  } finally {
    await conn.end().catch(() => {});
  }
}

async function explain(session, db, sql) {
  const pool = poolFor(session);
  const [r] = await pool.query(`EXPLAIN ${sql}`);
  return r;
}

async function processlist(session) {
  const pool = poolFor(session);
  const [r] = await pool.query('SHOW FULL PROCESSLIST');
  return r;
}

async function kill(session, id) {
  const pool = poolFor(session);
  await pool.query(`KILL ${parseInt(id, 10)}`);
}

async function variables(session) {
  const pool = poolFor(session);
  const [r] = await pool.query('SHOW VARIABLES');
  return r.map(x => ({ name: x.Variable_name, value: x.Value }));
}

async function status(session) {
  const pool = poolFor(session);
  const [r] = await pool.query('SHOW GLOBAL STATUS');
  return r.map(x => ({ name: x.Variable_name, value: x.Value }));
}

async function users(session) {
  const pool = poolFor(session);
  const [r] = await pool.query('SELECT User AS user, Host AS host, plugin FROM mysql.user ORDER BY User, Host');
  return r;
}

async function grants(session, user, host) {
  const pool = poolFor(session);
  const [r] = await pool.query(`SHOW GRANTS FOR ${q(user)}@${q(host)}`);
  return r.map(row => Object.values(row)[0]);
}

const NAME_RE = /^[\w.$%-]+$/;
const PRIV_RE = /^[A-Za-z (),]+$/;
const SCOPE_RE = /^(\*\.\*|`?[A-Za-z0-9_]+`?\.\*|`?[A-Za-z0-9_]+`?\.`?[A-Za-z0-9_]+`?)$/;

async function createUser(session, user, host, pass) {
  if (!NAME_RE.test(user) || !NAME_RE.test(host)) throw new Error('Invalid user or host');
  const pool = poolFor(session);
  await pool.query(`CREATE USER ${q(user)}@${q(host)} IDENTIFIED BY ${q(pass)}`);
}

async function dropUser(session, user, host) {
  if (!NAME_RE.test(user) || !NAME_RE.test(host)) throw new Error('Invalid user or host');
  const pool = poolFor(session);
  await pool.query(`DROP USER ${q(user)}@${q(host)}`);
}

async function setPassword(session, user, host, pass) {
  if (!NAME_RE.test(user) || !NAME_RE.test(host)) throw new Error('Invalid user or host');
  const pool = poolFor(session);
  await pool.query(`ALTER USER ${q(user)}@${q(host)} IDENTIFIED BY ${q(pass)}`);
}

async function grant(session, user, host, privs, scope) {
  if (!NAME_RE.test(user) || !NAME_RE.test(host)) throw new Error('Invalid user or host');
  if (!PRIV_RE.test(privs)) throw new Error('Invalid privileges list');
  if (!SCOPE_RE.test(scope)) throw new Error('Invalid grant scope');
  const pool = poolFor(session);
  await pool.query(`GRANT ${privs} ON ${scope} TO ${q(user)}@${q(host)}`);
}

async function revoke(session, user, host, privs, scope) {
  if (!NAME_RE.test(user) || !NAME_RE.test(host)) throw new Error('Invalid user or host');
  if (!PRIV_RE.test(privs)) throw new Error('Invalid privileges list');
  if (!SCOPE_RE.test(scope)) throw new Error('Invalid grant scope');
  const pool = poolFor(session);
  await pool.query(`REVOKE ${privs} ON ${scope} FROM ${q(user)}@${q(host)}`);
}

async function dump(session, db, opts) {
  const srv = serverCfg(session);
  const args = ['mariadb-dump', '-h', String(srv.host), '-P', String(srv.port), '-u', srv.user,
    '--single-transaction', '--default-character-set=utf8mb4', '--routines', '--events', '--triggers'];
  if (opts.structureOnly) args.push('--no-data');
  if (opts.dataOnly) args.push('--no-create-info');
  args.push(db);
  if (opts.tables && opts.tables.length) args.push(...opts.tables);
  const env = { PATH: process.env.PATH || '' };
  env['MYSQL_PWD'] = session.dbpass || '';
  const proc = Bun.spawn({ cmd: args, env, stdout: 'pipe', stderr: 'pipe' });
  const out = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
  const err = await new Response(proc.stderr).text();
  const code = await proc.exited;
  if (code !== 0) throw new Error(err || `mariadb-dump exited ${code}`);
  return out;
}

async function importSql(session, db, buf) {
  const srv = serverCfg(session);
  const args = ['mariadb', '-h', String(srv.host), '-P', String(srv.port), '-u', srv.user, db];
  const env = { PATH: process.env.PATH || '' };
  env['MYSQL_PWD'] = session.dbpass || '';
  const proc = Bun.spawn({ cmd: args, env, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
  await proc.stdin.write(buf);
  await proc.stdin.end();
  const err = await new Response(proc.stderr).text();
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  return { code, err, out };
}

async function blob(session, db, table, col, pkCols, pkVals) {
  const pool = poolFor(session);
  const wh = pkCols.map(c => `${ident(c)} = ?`).join(' AND ');
  const [r] = await pool.query(`SELECT ${ident(col)} AS val FROM ${ident(db)}.${ident(table)} WHERE ${wh} LIMIT 1`, pkVals);
  return r[0] ? r[0].val : null;
}

async function dropTable(session, db, table) {
  const pool = poolFor(session);
  await pool.query(`DROP TABLE ${ident(db)}.${ident(table)}`);
}

async function truncate(session, db, table) {
  const pool = poolFor(session);
  await pool.query(`TRUNCATE TABLE ${ident(db)}.${ident(table)}`);
}

function dumpVal(x) {
  if (x === null || x === undefined) return 'NULL';
  if (typeof x === 'number') return String(x);
  if (typeof x === 'bigint') return String(x);
  if (Buffer.isBuffer(x) || x instanceof Uint8Array) { const b = Buffer.from(x); return "X'" + b.toString('hex') + "'"; }
  if (typeof x === 'object') return q(JSON.stringify(x));
  return q(String(x));
}

async function exportRows(session, db, table, pkCols, pkRows) {
  const pool = poolFor(session);
  if (!pkRows.length) return new TextEncoder().encode('');
  const colList = pkCols.map(ident).join(', ');
  const placeholders = pkRows.map(row => '(' + row.map(() => '?').join(',') + ')').join(',');
  const flat = [].concat(...pkRows);
  const [rows] = await pool.query(`SELECT * FROM ${ident(db)}.${ident(table)} WHERE (${colList}) IN (${placeholders})`, flat);
  if (!rows.length) return new TextEncoder().encode('');
  const cols = Object.keys(rows[0]);
  const lines = rows.map(r => `INSERT INTO ${ident(db)}.${ident(table)} (${cols.map(ident).join(', ')}) VALUES (${cols.map(c => dumpVal(r[c])).join(', ')});`);
  return new TextEncoder().encode(lines.join('\n') + '\n');
}

function defLiteral(d) {
  const s = String(d).trim();
  if (/^null$/i.test(s)) return 'NULL';
  if (/^current_timestamp(\(\))?$/i.test(s)) return s;
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  return q(s);
}

function colDef(c) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(c.name)) throw new Error('Invalid column name');
  if (!/^[A-Za-z0-9 _(),.'"\[\]]+$/.test(c.type)) throw new Error('Invalid column type');
  const len = c.length && /^[\d,]{1,12}$/.test(c.length) ? `(${c.length})` : '';
  let s = `${ident(c.name)} ${c.type}${len}`;
  if (c.unsigned) s += ' UNSIGNED';
  s += c.nullable === false ? ' NOT NULL' : ' NULL';
  if (c.def !== undefined && c.def !== null && c.def !== '') s += ` DEFAULT ${defLiteral(c.def)}`;
  if (c.autoInc) s += ' AUTO_INCREMENT';
  return s;
}

async function createTable(session, db, name, cols, opts) {
  const pool = poolFor(session);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Invalid table name');
  const engine = /^[A-Za-z]+$/.test((opts && opts.engine) || '') ? opts.engine : 'InnoDB';
  const defs = cols.map(colDef);
  const sql = `CREATE TABLE ${ident(db)}.${ident(name)} (${defs.join(', ')}) ENGINE=${engine} DEFAULT CHARSET=utf8mb4`;
  await pool.query(sql);
  return { sql };
}

async function addColumn(session, db, table, c) {
  const pool = poolFor(session);
  await pool.query(`ALTER TABLE ${ident(db)}.${ident(table)} ADD COLUMN ${colDef(c)}`);
}

async function dropColumn(session, db, table, colName) {
  const pool = poolFor(session);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(colName)) throw new Error('Invalid column name');
  await pool.query(`ALTER TABLE ${ident(db)}.${ident(table)} DROP COLUMN ${ident(colName)}`);
}

async function editColumn(session, db, table, oldName, c) {
  const pool = poolFor(session);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(oldName)) throw new Error('Invalid column name');
  const def = colDef(c);
  const clause = c.name === oldName ? `MODIFY COLUMN ${def}` : `CHANGE COLUMN ${ident(oldName)} ${def}`;
  await pool.query(`ALTER TABLE ${ident(db)}.${ident(table)} ${clause}`);
}

async function reorderColumns(session, db, table, order) {
  const pool = poolFor(session);
  const info = await columns(session, db, table);
  const byName = Object.fromEntries(info.cols.map(x => [x.name, x]));
  const clauses = order.map((name, i) => {
    const c = byName[name];
    if (!c) throw new Error('Unknown column: ' + name);
    let def = `${ident(c.name)} ${c.type}`;
    def += String(c.nullable).toLowerCase() === 'yes' ? ' NULL' : ' NOT NULL';
    if (c.def !== null && c.def !== undefined && c.def !== '') def += ` DEFAULT ${defLiteral(c.def)}`;
    if ((c.extra || '').toLowerCase().includes('auto_increment')) def += ' AUTO_INCREMENT';
    return `MODIFY COLUMN ${def} ${i === 0 ? 'FIRST' : `AFTER ${ident(order[i - 1])}`}`;
  });
  await pool.query(`ALTER TABLE ${ident(db)}.${ident(table)} ${clauses.join(', ')}`);
}

export default {
  ping, close, databases, tables, primaryKey, columns, rows, rowByPk, insert, update, remove,
  execute, explain, processlist, kill, variables, status, users, grants,
  createUser, dropUser, setPassword, grant, revoke, dump, importSql, blob, dropTable, truncate, exportRows,
  createTable, addColumn, dropColumn, editColumn, reorderColumns,
};
