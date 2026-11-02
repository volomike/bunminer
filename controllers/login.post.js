// Parse "host" or "host:port" from the Server field. A bare host keeps the platform default port.
function parseHostPort(s) {
  const i = s.lastIndexOf(':');
  if (i > 0 && /^\d+$/.test(s.slice(i + 1))) {
    return { host: s.slice(0, i), port: parseInt(s.slice(i + 1), 10) };
  }
  return { host: s, port: null };
}

export default async function({ w, VIEW, server }) {
  const driver = w.post['driver'] || 'maria';
  const srv = w.config.servers.find(x => x.id === driver) || w.config.servers[0];
  const adapter = w.m[srv.engine];
  const ip = w.m.guard.clientIp(w, server);
  const usernameRaw = (w.post['username'] || '').trim();
  const userKey = srv.engine === 'sqlite' ? '' : (usernameRaw || srv.user || '');

  const fail = async (msg, opts = {}) => {
    VIEW.title = 'Login';
    VIEW.servers = w.config.servers;
    VIEW.sqliteEnabled = !!(w.config.sqlite && w.config.sqlite.enabled === true);
    VIEW.error = msg;
    VIEW.driver = driver;
    VIEW.username = opts.username !== undefined ? opts.username : usernameRaw;
    VIEW.db = w.post['db'] || '';
    return w.renderView('v-login.ejs');
  };

  if (!adapter) return await fail('Unknown driver.');

  // honeypot — humans never see or fill this field
  if ((w.post['website'] || '').trim() !== '') {
    console.log(`[guard] honeypot ip=${ip}`);
    await Bun.sleep(2000);
    return await fail('Invalid credentials.');
  }

  // throttle / lockout
  const blocked = w.m.guard.blockedFor(w, userKey);
  if (blocked > 0) {
    const secs = Math.max(1, Math.ceil(blocked / 1000));
    console.log(`[guard] blocked ip=${ip} user=${userKey || '-'} wait=${secs}s`);
    await Bun.sleep(1000);
    return await fail(`Too many failed attempts — try again in ${secs}s.`);
  }

  let username = srv.user || '';
  let dbpass = '';
  let db = '';
  let host = srv.host || '';
  let port = srv.port || '';

  if (srv.engine === 'sqlite') {
    db = (w.post['server'] || '').trim();
    if (!db) return await fail('Please provide the SQLite file path.');
    // SQLite has no credentials of its own — gate it on config (enabled + allowedDirs).
    const perr = adapter.pathError ? adapter.pathError(db) : null;
    if (perr) return await fail(perr);
  } else {
    username = usernameRaw || srv.user;
    dbpass = w.post['password'] || '';
    db = (w.post['db'] || '').trim();
    // The "Server" field accepts "host" or "host:port"; defaults to the configured host + platform port.
    const hostField = (w.post['server'] || '').trim();
    if (hostField) {
      const parsed = parseHostPort(hostField);
      host = parsed.host || host;
      if (parsed.port) port = parsed.port;
    }
  }

  const permanent = ['1', 'on', 'true'].includes(String(w.post['permanent'] || ''));
  const probe = { engine: srv.engine, serverId: srv.id, username, dbpass, db: db || undefined, host, port };

  try {
    await adapter.ping(probe);
  } catch (e) {
    w.m.guard.fail(ip, userKey);
    console.log(`[guard] fail ip=${ip} user=${userKey || '-'} engine=${srv.engine}`);
    await Bun.sleep(1000); // slow down automated attempts
    return await fail('Invalid credentials.'); // generic — never reveal whether the user exists
  }

  w.m.guard.success(ip, userKey);
  const platform = srv.engine === 'maria'
    ? (probe.mariaFlavor === 'mysql' ? 'MySQL' : 'MariaDB')
    : srv.engine === 'pgsql' ? 'PostgreSQL' : 'SQLite';
  w.m.session.start(w, { engine: srv.engine, serverId: srv.id, username, dbpass, db: db || null, permanent, platform, host, port, mariaFlavor: probe.mariaFlavor || null });
  if (db) return w.m.session.redirect(w, '/db' + (srv.engine === 'sqlite' ? '' : '?db=' + encodeURIComponent(db)));
  return w.m.session.redirect(w, '/server');
}
