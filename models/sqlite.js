// models/sqlite.js — SQLite adapter (bun:sqlite). Session.db holds the file path.
// SQLite files carry no credentials of their own, so this adapter is gated by
// config.sqlite.enabled plus an allowed-directory allowlist (see pathError()).

import { Database } from 'bun:sqlite';
import { realpathSync } from 'node:fs';
import path from 'node:path';

// Validate a SQLite file path against the config gate. Returns an error-message
// string, or null when the path is allowed. Symlinks are resolved before the
// directory check, so a link inside the allowlist cannot point outside it.
function pathError(file) {
  const cfg = globalThis.w.config.sqlite || {};
  if (cfg.enabled !== true) {
    return 'SQLite support is disabled in this configuration. Set sqlite.enabled to true in config/config.js to enable it.';
  }
  if (!file) return 'No database file selected';
  const allowed = (cfg.allowedDirs || []).map(x => String(x)).filter(Boolean);
  let real;
  try { real = realpathSync(file); } catch (e) { real = path.resolve(file); }
  for (const dir of allowed) {
    let rdir;
    try { rdir = realpathSync(dir); } catch (e) { rdir = path.resolve(dir); }
    if (real === rdir || real.startsWith(rdir + path.sep)) return null;
  }
  return 'SQLite database file must reside in an allowed directory';
}

function open(session) {
  const path = session.db;
  const err = pathError(path);
  if (err) throw new Error(err);
  const cfg = globalThis.w.config.sqlite || {};
  const readonly = cfg.defaultReadonly === true;
  const db = new Database(path, { readonly, create: false });
  db.run('PRAGMA busy_timeout = 5000');
  return db;
}

function ident(x) { return '"' + String(x).replace(/"/g, '""') + '"'; }

function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'bigint') return String(v);
  if (typeof v === 'number') return String(v);
  if (v instanceof Uint8Array || v instanceof ArrayBuffer) {
    const buf = v instanceof ArrayBuffer ? new Uint8Array(v) : v;
    let hex = '';
    for (const b of buf) hex += b.toString(16).padStart(2, '0');
    return `X'${hex}'`;
  }
  if (typeof v === 'string') return "'" + v.replace(/'/g, "''") + "'";
  if (typeof v === 'boolean') return v ? '1' : '0';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

async function ping(session) {
  const db = open(session);
  db.query('SELECT 1').get();
  db.close();
  return true;
}

async function close() {}

async function databases(session) {
  return [{ name: 'main', file: session.db, bytes: 0, tables: 0 }];
}

async function tables(session, _schema) {
  const db = open(session);
  try {
    const objs = db.query(
      `SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name`
    ).all();
    return objs.map(o => {
      let rows = 0;
      try { rows = Number(db.query(`SELECT COUNT(*) AS n FROM ${ident(o.name)}`).get().n); } catch {}
      return { name: o.name, type: o.type === 'view' ? 'VIEW' : 'BASE TABLE', rows, bytes: 0, comment: '' };
    });
  } finally { db.close(); }
}

async function columns(session, _schema, table) {
  const db = open(session);
  try {
    const cols = db.query(`PRAGMA table_info(${ident(table)})`).all();
    const idx = db.query(`PRAGMA index_list(${ident(table)})`).all();
    const fk = db.query(`PRAGMA foreign_key_list(${ident(table)})`).all();
    const master = db.query(`SELECT sql FROM sqlite_master WHERE name = ?`).get(table);
    return {
      cols: cols.map(c => ({ name: c.name, type: c.type, nullable: !c.notnull, def: c.dflt_value, pk: c.pk, extra: '' })),
      indexes: idx,
      fks: fk.map(f => ({ name: f.table, col: f.from, refTable: f.table, refCol: f.to, onUpdate: f.on_update, onDelete: f.on_delete })),
      createSql: (master && master.sql) || '',
      pk: cols.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name),
    };
  } finally { db.close(); }
}

function tableHasRowid(db, table) {
  const master = db.query(`SELECT sql FROM sqlite_master WHERE name = ?`).get(table);
  return !(master && master.sql && /WITHOUT\s+ROWID/i.test(master.sql));
}

async function rows(session, _schema, table, o = {}) {
  const db = open(session);
  try {
    const where = (o.where || '').trim();
    const order = (o.order || '').trim();
    const limit = Math.min(Math.max(parseInt(o.limit, 10) || 30, 1), 1000);
    const offset = Math.max(parseInt(o.offset, 10) || 0, 0);
    const useRowid = tableHasRowid(db, table);
    const sel = useRowid ? '*, rowid' : '*';
    const wh = where ? ` WHERE ${where}` : '';
    const ord = order ? ` ORDER BY ${order}` : '';
    const r = db.query(`SELECT ${sel} FROM ${ident(table)}${wh}${ord} LIMIT ${limit} OFFSET ${offset}`).all();
    const c = db.query(`SELECT COUNT(*) AS n FROM ${ident(table)}${wh}`).get();
    return { rows: r, total: Number(c.n), useRowid };
  } finally { db.close(); }
}

async function rowByPk(session, _schema, table, pkCols, pkVals) {
  const db = open(session);
  try {
    const wh = pkCols.map(c => `${ident(c)} = ?`).join(' AND ');
    return db.query(`SELECT * FROM ${ident(table)} WHERE ${wh} LIMIT 1`).get(...pkVals) || null;
  } finally { db.close(); }
}

async function insert(session, _schema, table, values) {
  const db = open(session);
  try {
    const keys = Object.keys(values);
    const sql = `INSERT INTO ${ident(table)} (${keys.map(ident).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
    db.run(sql, keys.map(k => values[k]));
    return { affectedRows: 1 };
  } finally { db.close(); }
}

async function update(session, _schema, table, values, pkCols, pkVals) {
  const db = open(session);
  try {
    const keys = Object.keys(values);
    const set = keys.map(k => `${ident(k)} = ?`).join(', ');
    const wh = pkCols.map(c => `${ident(c)} = ?`).join(' AND ');
    db.run(`UPDATE ${ident(table)} SET ${set} WHERE ${wh}`, [...keys.map(k => values[k]), ...pkVals]);
    return { affectedRows: 1 };
  } finally { db.close(); }
}

async function remove(session, _schema, table, pkCols, pkVals) {
  const db = open(session);
  try {
    const wh = pkCols.map(c => `${ident(c)} = ?`).join(' AND ');
    db.run(`DELETE FROM ${ident(table)} WHERE ${wh}`, pkVals);
    return { affectedRows: 1 };
  } finally { db.close(); }
}

async function execute(session, _schema, sql) {
  const db = open(session);
  try {
    const stmt = sql.trim();
    const cleaned = stmt.replace(/;+\s*$/, '').trim();
    const single = !cleaned.includes(';');
    if (single && /^(select|with|pragma|explain|values)\b/i.test(cleaned)) {
      const rows = db.query(cleaned).all();
      return [{ type: 'result', columns: rows[0] ? Object.keys(rows[0]) : [], rows }];
    }
    db.exec(stmt);
    const changes = db.query('SELECT changes() AS n').get();
    return [{ type: 'ok', affectedRows: Number(changes.n) }];
  } finally { db.close(); }
}

async function explain(session, _schema, sql) {
  const db = open(session);
  try {
    return db.query(`EXPLAIN QUERY PLAN ${sql}`).all();
  } finally { db.close(); }
}

async function dump(session, opts) {
  const db = open(session);
  try {
    const lines = [];
    const objs = db.query(`SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name`).all();
    for (const o of objs) {
      if (o.type === 'table') {
        lines.push(`${o.sql};`);
        if (!opts.structureOnly) {
          const data = db.query(`SELECT * FROM ${ident(o.name)}`).all();
          for (const row of data) {
            const cols = Object.keys(row);
            lines.push(`INSERT INTO ${ident(o.name)} (${cols.map(ident).join(', ')}) VALUES (${cols.map(c => lit(row[c])).join(', ')});`);
          }
        }
      } else {
        lines.push(`${o.sql};`);
      }
    }
    return new TextEncoder().encode(lines.join('\n'));
  } finally { db.close(); }
}

async function importSql(session, buf) {
  const db = open(session);
  try {
    db.run('BEGIN');
    db.exec(new TextDecoder().decode(buf));
    db.run('COMMIT');
    return { code: 0, err: '', out: 'ok' };
  } catch (e) {
    try { db.run('ROLLBACK'); } catch {}
    return { code: 1, err: e.message, out: '' };
  } finally { db.close(); }
}

async function blob(session, _schema, table, col, pkCols, pkVals) {
  const db = open(session);
  try {
    const wh = pkCols.map(c => `${ident(c)} = ?`).join(' AND ');
    const r = db.query(`SELECT ${ident(col)} AS val FROM ${ident(table)} WHERE ${wh} LIMIT 1`).get(...pkVals);
    return r ? r.val : null;
  } finally { db.close(); }
}

async function dropTable(session, _schema, table) {
  const db = open(session);
  try { db.run(`DROP TABLE ${ident(table)}`); return {}; } finally { db.close(); }
}

async function truncate(session, _schema, table) {
  const db = open(session);
  try { db.run(`DELETE FROM ${ident(table)}`); return {}; } finally { db.close(); }
}

async function exportRows(session, _schema, table, pkCols, pkRows) {
  const db = open(session);
  try {
    if (!pkRows.length) return new TextEncoder().encode('');
    const colList = pkCols.map(ident).join(', ');
    const placeholders = pkRows.map(row => '(' + row.map(() => '?').join(',') + ')').join(',');
    const rows = db.query(`SELECT * FROM ${ident(table)} WHERE (${colList}) IN (${placeholders})`).all(...[].concat(...pkRows));
    if (!rows.length) return new TextEncoder().encode('');
    const cols = Object.keys(rows[0]);
    const lines = rows.map(r => `INSERT INTO ${ident(table)} (${cols.map(ident).join(', ')}) VALUES (${cols.map(c => lit(r[c])).join(', ')});`);
    return new TextEncoder().encode(lines.join('\n') + '\n');
  } finally { db.close(); }
}

function defLit(d) {
  const s = String(d).trim();
  if (/^null$/i.test(s)) return 'NULL';
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  return lit(s);
}

async function createTable(session, _schema, name, cols) {
  const db = open(session);
  try {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Invalid table name');
    const defs = cols.map(c => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(c.name)) throw new Error('Invalid column name');
      if (!/^[A-Za-z0-9 _(),.'"\[\]]+$/.test(c.type)) throw new Error('Invalid column type');
      const len = c.length && /^[\d,]{1,12}$/.test(c.length) ? `(${c.length})` : '';
      let s = `${ident(c.name)} ${c.type}${len}`;
      s += c.nullable === false ? ' NOT NULL' : '';
      if (c.def !== undefined && c.def !== null && c.def !== '') s += ` DEFAULT ${defLit(c.def)}`;
      return s;
    });
    db.run(`CREATE TABLE ${ident(name)} (${defs.join(', ')})`);
    return {};
  } finally { db.close(); }
}

async function addColumn(session, _schema, table, c) {
  const db = open(session);
  try {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(c.name)) throw new Error('Invalid column name');
    if (!/^[A-Za-z0-9 _(),.'"\[\]]+$/.test(c.type || '')) throw new Error('Invalid column type');
    const len = c.length && /^[\d,]{1,12}$/.test(c.length) ? `(${c.length})` : '';
    let s = `${ident(c.name)} ${c.type || 'TEXT'}${len}`;
    s += c.nullable === false ? ' NOT NULL' : '';
    if (c.def !== undefined && c.def !== null && c.def !== '') s += ` DEFAULT ${defLit(c.def)}`;
    db.run(`ALTER TABLE ${ident(table)} ADD COLUMN ${s}`);
    return {};
  } finally { db.close(); }
}

async function dropColumn(session, _schema, table, colName) {
  const db = open(session);
  try {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(colName)) throw new Error('Invalid column name');
    db.run(`ALTER TABLE ${ident(table)} DROP COLUMN ${ident(colName)}`);
    return {};
  } finally { db.close(); }
}

async function editColumn(session, _schema, table, oldName, c) {
  const db = open(session);
  try {
    if (c.name && c.name !== oldName) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(c.name)) throw new Error('Invalid column name');
      db.run(`ALTER TABLE ${ident(table)} RENAME COLUMN ${ident(oldName)} TO ${ident(c.name)}`);
      return {};
    }
    throw new Error('SQLite cannot change a column type or nullability — drop the column and add it again instead.');
  } finally { db.close(); }
}

async function createIndex(session, _schema, table, name, columns, unique) {
  const db = open(session);
  try {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Invalid index name');
    if (!columns.length) throw new Error('Specify at least one column');
    const cols = columns.map(c => ident(c)).join(', ');
    db.run(`CREATE ${unique ? 'UNIQUE ' : ''}INDEX ${ident(name)} ON ${ident(table)} (${cols})`);
    return {};
  } finally { db.close(); }
}

async function dropIndex(session, _schema, table, name) {
  const db = open(session);
  try {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Invalid index name');
    db.run(`DROP INDEX ${ident(name)}`);
    return {};
  } finally { db.close(); }
}

async function renameIndex() {
  throw new Error('SQLite cannot rename an index — drop it and create a new one instead.');
}

async function deleteWhere(session, _schema, table, where) {
  const db = open(session);
  try {
    const wh = (where || '').trim();
    db.run(`DELETE FROM ${ident(table)}${wh ? ' WHERE ' + wh : ''}`);
    return {};
  } finally { db.close(); }
}

async function pks(session, _schema, table, where) {
  const db = open(session);
  try {
    const pkCols = db.query(`PRAGMA table_info(${ident(table)})`).all().filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name);
    if (!pkCols.length) return { pkCols: [], pkRows: [] };
    const wh = (where || '').trim();
    const rows = db.query(`SELECT ${pkCols.map(ident).join(', ')} FROM ${ident(table)}${wh ? ' WHERE ' + wh : ''}`).all();
    return { pkCols, pkRows: rows.map(r => pkCols.map(c => r[c])) };
  } finally { db.close(); }
}

export default {
  pathError, ping, close, databases, tables, columns, rows, rowByPk, insert, update, remove,
  execute, explain, dump, importSql, blob, dropTable, truncate, exportRows,
  createTable, addColumn, dropColumn, editColumn,
  createIndex, dropIndex, renameIndex,
  deleteWhere, pks,
};
