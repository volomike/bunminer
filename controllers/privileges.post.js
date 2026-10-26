export default async function({ w }) {
  const s = w.m.session.current(w);
  if (!s) return w.doRedirect('/');
  if (w.post['csrf'] !== s.csrf) return w.doRedirect('/');
  const adapter = w.m[s.engine];
  const action = w.post['action'] || '';

  if (s.engine === 'maria') {
    const user = w.post['user'] || '';
    const host = w.post['host'] || '';
    const pass = w.post['pass'] || '';
    const privs = w.post['privs'] || '';
    const scope = w.post['scope'] || '';
    if (action === 'create-user') await adapter.createUser(s, user, host, pass);
    else if (action === 'drop-user') await adapter.dropUser(s, user, host);
    else if (action === 'set-password') await adapter.setPassword(s, user, host, pass);
    else if (action === 'grant') await adapter.grant(s, user, host, privs, scope);
    else if (action === 'revoke') await adapter.revoke(s, user, host, privs, scope);
  } else if (s.engine === 'pgsql') {
    const name = w.post['name'] || '';
    const pass = w.post['pass'] || '';
    const privs = w.post['privs'] || '';
    const scope = w.post['scope'] || '';
    const opts = {
      superuser: w.post['superuser'] === '1',
      createdb: w.post['createdb'] === '1',
      login: w.post['login'] === '1',
    };
    if (action === 'create-role') await adapter.createRole(s, name, pass, opts);
    else if (action === 'drop-role') await adapter.dropRole(s, name);
    else if (action === 'alter-role') await adapter.alterRole(s, name, pass);
    else if (action === 'grant') await adapter.grant(s, name, privs, scope);
    else if (action === 'revoke') await adapter.revoke(s, name, privs, scope);
  }
  return w.doRedirect('/privileges');
}
