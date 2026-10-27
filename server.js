// BunDB Panel — server bootstrap (BriskMVC), bound to loopback (nginx is the only entry point)
import { loadConfig } from './briskmvc/config.js';
import { createElysia } from './briskmvc/elysia.js';
import { setupStatic } from './briskmvc/static.js';
import { setupFavicon } from './briskmvc/favicon.js';
import { loadRoutes } from './briskmvc/router.js';

const BASEPATH = import.meta.dir;
const CONFIG = loadConfig({ BASEPATH });

const app = createElysia({ BASEPATH });

// Security headers on every response (hardening pass)
app.onRequest(({ set }) => {
  set.headers['X-Content-Type-Options'] = 'nosniff';
  set.headers['X-Frame-Options'] = 'DENY';
  set.headers['Referrer-Policy'] = 'no-referrer';
  set.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  set.headers['Cache-Control'] = 'no-store';
  set.headers['Content-Security-Policy'] =
    "default-src 'self'; script-src 'self' https://code.jquery.com https://cdn.jsdelivr.net https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data:; connect-src 'self' https://cdn.jsdelivr.net https://code.jquery.com https://static.cloudflareinsights.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
});

setupStatic(app, { BASEPATH });
setupFavicon(app, { BASEPATH });
loadRoutes(app, { BASEPATH });

// Generic, unbranded 404 — the project is open-source and portable
app.all('*', () => new Response(
  '<!DOCTYPE html><html><head><meta charset="utf-8"><title>404</title></head><body><h1>404, Page Not Found</h1></body></html>',
  { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
));

const PORT = parseInt(process.env.PORT, 10) || 3070;
app.listen({ port: PORT, hostname: '127.0.0.1' });
console.log(`BunDB Panel listening on 127.0.0.1:${PORT}`);
