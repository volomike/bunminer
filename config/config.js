{
  "VERSION": "0.1.0",
  "site": { "title": "Bunminer", "hostname": "dbxadm2.dpro.io" },
  "servers": [
    { "id": "maria", "label": "MariaDB/MySQL", "engine": "maria", "host": "127.0.0.1", "port": 3306, "user": "root" },
    { "id": "pgsql", "label": "PostgreSQL", "engine": "pgsql", "host": "127.0.0.1", "port": 5432, "user": "postgres" },
    { "id": "sqlite", "label": "SQLite", "engine": "sqlite" }
  ],
  // ---------------------------------------------------------------------------
  // trustProxyHeaders
  //
  // Bunminer cannot assume it runs behind a proxy, so forwarded headers
  // (X-Forwarded-For, CF-Connecting-IP) are NOT trusted by default — the login
  // rate limiter keys on the real socket address instead, so clients cannot
  // spoof those headers to dodge per-IP limits.
  //
  // Set this to true ONLY when the app is reachable exclusively through a
  // trusted reverse proxy (nginx, Cloudflare, ...) whose forwarded headers
  // clients cannot forge — i.e. the origin is firewalled to the proxy's IPs.
  // Without that firewall, enabling this lets attackers rotate the header and
  // evade rate limiting.
  // ---------------------------------------------------------------------------
  "trustProxyHeaders": false,
  "sess": { "idleSec": 900, "absoluteSec": 28800, "permanentSec": 604800, "cookie": "bunminer_sid" },
  // ---------------------------------------------------------------------------
  // SQLite support
  //
  // SQLite files have no password of their own, so this engine ships DISABLED.
  // Set "enabled" to true to allow logins against SQLite database files — the
  // login page shows a "disabled" notice until then.
  //
  // "allowedDirs": when enabled, a database file may only be opened if its real
  // (symlink-resolved) path lives under one of these directories. The default
  // below is /opt/datastores — edit freely to fit your server layout.
  //
  // "defaultReadonly": open databases read-only (true) or read-write (false).
  // ---------------------------------------------------------------------------
  "sqlite": {
    "enabled": false,
    "allowedDirs": [ "/opt/datastores" ],
    "defaultReadonly": false
  },
  "import": { "maxBytes": 268435456, "timeoutSec": 600 },
  "SHOW_FULL_ERRORS": false
}
