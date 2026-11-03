export default async function({ w }) {
  const s = w.m.session.current(w);
  if (s) {
    // POST-only logout with CSRF: a cross-site page cannot force a log-out.
    if (w.post['csrf'] === s.csrf) {
      const adapter = w.m[s.engine];
      if (adapter && adapter.close) await adapter.close(s);
      w.m.session.destroy(w);
    }
  }
  return w.m.session.redirect(w, '/');
}
