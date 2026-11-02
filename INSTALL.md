# Bunminer — Installation

Bunminer is a web-based database manager for **MariaDB/MySQL**, **PostgreSQL**, and
**SQLite**, built on [Bun](https://bun.sh) with a nod to Adminer. This file covers what you
need and how to run it in production.

## Requirements

- **Bun** `1.x` (the app runs on Bun — Node is not required). Install:
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```
- **systemd** (Linux) to run it as a service.
- **nginx** (or any reverse proxy) to terminate TLS and proxy to the Bun service.
- At least one database engine to manage (optional — the panel is only a client):
  - MariaDB/MySQL server, and/or
  - PostgreSQL server, and/or
  - SQLite files on disk.

> **No database passwords live in this repo.** You type the database username and password
> at the login screen each session; they are held in server memory only and never written to
> disk, a cookie, or a config file. See [Security](#security).

## Install

```bash
# 1. Clone and install dependencies
git clone https://github.com/volomike/bunminer.git
cd bunminer
bun install

# 2. Review/adjust the server list in config/config.js (host/user/port — no passwords)
#    The app's own listen port comes from the PORT environment variable (see systemd below).

# 3. (First run generates data/secret.key automatically — do not commit or share it.)
```

### Configure the servers you manage

Edit `config/config.js` → `servers`. Each entry is `{ id, label, engine, host, port, user }`.

```js
"servers": [
  { "id": "maria",  "label": "MariaDB/MySQL", "engine": "maria",  "host": "127.0.0.1", "port": 3306, "user": "root" },
  { "id": "pgsql",  "label": "PostgreSQL",    "engine": "pgsql",  "host": "127.0.0.1", "port": 5432, "user": "postgres" },
  { "id": "sqlite", "label": "SQLite",        "engine": "sqlite" }
]
```

At login you can override the host and port (e.g. `dbserver:3307`) in the **Server** field;
when omitted, the platform default port is used (3306 for MariaDB/MySQL, 5432 for PostgreSQL).

#### SQLite is gated by default

SQLite files have no password of their own, so the engine ships **disabled**
(`sqlite.enabled: false` in `config/config.js`). The login page shows a "disabled" notice
until you enable it. When enabled, a database file may only be opened if its
symlink-resolved path lives under a directory listed in `sqlite.allowedDirs`
(default `/opt/datastores`) — edit the list to fit your server layout.

### systemd service

The app's listen **port comes from systemd** (`Environment=PORT=…`), not from the config file.
Create `/etc/systemd/system/bunminer.service`:

```ini
[Unit]
Description=Bunminer — database manager in BunJS
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/path/to/bunminer
Environment=PORT=3070
ExecStart=/usr/local/bun/bun run server.js
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bunminer
```

The service binds to `127.0.0.1` only — nginx is the only public entry point.

### nginx reverse proxy

Create a vhost that proxies to the Bun service. The origin listens on plain HTTP, so
you bring your own TLS termination: either a CDN/proxy in front (e.g. Cloudflare Full
TLS) or nginx itself with a certificate. Without TLS you should only ever run this on
a trusted network:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name db.example.com;

    # Serve the LICENSE file as plain text at /LICENSE
    location = /LICENSE {
        root /path/to/bunminer;
        default_type text/plain;
    }

    location / {
        proxy_pass http://127.0.0.1:3070;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        client_max_body_size 256m;
        proxy_read_timeout 600s;
    }
}
```

Then `sudo nginx -t && sudo systemctl reload nginx`.

## Security

- **No credentials in the repo.** Database passwords are entered at login and held in memory.
  Future secrets (API keys, SMTP, …) belong in environment variables, never in a committed file.
- **`.gitignore`** excludes `data/` (the per-install `secret.key`), SQLite/DB files, `.env*`,
  `*.log`, `*.pem`, `*.key`, and `*.crt`.
- **`data/secret.key`** is generated on first run and signs session cookies. It is
  per-installation — never copy it between installs or commit it.
- **SQLite is disabled by default** (`sqlite.enabled: false`) because SQLite files carry
  no credentials; when enabled, paths are confined to `sqlite.allowedDirs` (default
  `/opt/datastores`, symlink-resolved) so one engine cannot be used to open arbitrary files
  on the server.
- **Forwarded headers are not trusted by default** (`trustProxyHeaders: false`): the login
  rate limiter keys on the real socket address, so spoofed `X-Forwarded-For` /
  `CF-Connecting-IP` headers cannot dodge it. If the app is reachable *only* through a
  trusted proxy (origin firewalled to the proxy's IPs), set `trustProxyHeaders: true` in
  `config/config.js` to rate-limit on true per-client IPs.
- **No Cloudflare (or any CDN) required.** The app's own defenses (rate-limited login,
  CSRF, signed sessions, SQLite path gate) work with or without a proxy in front. If you do
  run Cloudflare or a similar proxy, use its extra features (edge rate limits, managed
  challenges, mTLS, TLS termination) as an added layer — not a requirement.
- The service binds to loopback; expose it only through a hardened reverse proxy.
- See `FORTIFICATION.md` for the full threat model and hardening notes.

## License

[MIT](LICENSE) — Copyright (c) 2026 Mike McKee and Artur Abovyan.
