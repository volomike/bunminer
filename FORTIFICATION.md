# Bunminer — FORTIFICATION.md

> **Status: planning document.** The fortifications below are written down, not implemented.
> Only the items listed under "Already in place" are live today. Reading this file changes nothing.

## Purpose

Bunminer is a web-based database manager (MariaDB, PostgreSQL, SQLite) built on BunJS/BriskMVC.
It is a high-power tool by design: one successful login can read, write, or destroy an entire
database. If this panel is exposed to the public internet it *will* be found by scanners and
actively attacked. This document collects the fortifications that would make attackers severely
frustrated — before, during, and after a login attempt — and maps each one to where it would live
in this codebase.

### Threat model

- **Opportunistic bots** — mass scanners probing login pages, SQL-injection payloads, known CVEs.
- **Credential stuffing / password spraying** — slow, distributed login attempts against
  well-known usernames (`root`, `postgres`, `admin`).
- **Targeted attacker** — someone who knows this host exists and has time.
- **Post-compromise abuse** — once inside: data exfiltration (export/SQL box), lateral movement
  via `SELECT ... INTO OUTFILE`, credential theft, data destruction/ransom.

Assets to protect: database contents, database credentials, the server, the operator's reputation.

### Defense in depth — how the layers compose

Edge (Cloudflare WAF/rate rules) → transport (Full TLS) → reverse proxy (nginx limits, headers,
Host check) → application (auth, rate limits, escaping, CSP) → database (least privilege,
loopback-only, statement limits). Each layer assumes the one before it has failed; no single
layer is load-bearing. A fortification that exists in only one layer (e.g. a login rate limit
only in nginx) is a single point of failure — mirror the critical ones in the app too.

## Already in place (baseline)

| Control | Where it lives |
|---|---|
| App binds `127.0.0.1` only; nginx is the sole entry point | `server.js` |
| Cloudflare proxy in front of the origin (Flexible SSL today) | deployment |
| Session cookie: HttpOnly + Secure + SameSite=Lax | `models/session.js` |
| DB password lives in server memory only — never written to disk, never in a cookie | `models/session.js` |
| CSRF token checked on every state-changing POST | all `*.post.js` controllers |
| Parameterized SQL everywhere; identifiers quoted per engine | `models/maria.js` `pgsql.js` `sqlite.js` |
| EJS auto-escaping of every rendered value | views |
| AYS dialog (checkbox + red button) before destructive actions | `views/assets/js/dialog/` |
| Error output redacts lines containing credentials | `briskmvc/errors.js` |
| Service runs as `www-data` with an 85% CPU quota | systemd unit |
| Row result cap (1000) and 256 MB import cap | controllers |
| SQLite file paths never appear in URLs | `models/fmt.js` |
| Generic, unbranded 404 page | `server.js` |

## Implemented — 2026-10-26 hardening pass

- **Per-installation HMAC secret** (`data/secret.key`, 0600, generated on first use) signs the
  session cookie — someone who installs this open-source code and learns their own install's
  behavior still cannot forge a session cookie for any other installation.
- **Login brute-force guard** (`models/guard.js`): per-IP throttle (10 failures / 5 min → 15 min
  block) and per-username lockout (5 failures / 10 min → 10 min lock), in-memory, plus a 1 s
  delay on every failed attempt (2 s on honeypot hits).
- **Honeypot field** on the login form (`website`), visually hidden; bots that fill it get a
  generic failure and are never processed further.
- **Generic login errors**: every failure returns "Invalid credentials." — the real driver error
  only goes to the server log (no user enumeration).
- **Security headers** on every response: CSP, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, HSTS, `Cache-Control: no-store`.
- **Session TTLs tightened**: 15 min idle / 8 h absolute / 7 d permanent (permanent is opt-in).
- **Destructive-statement warning** banner in the SQL box (DROP/TRUNCATE/DELETE/ALTER/...).
- **Generic server labels** (no hostnames on the login page).
- `.gitignore` excludes runtime secrets (`data/`, SQLite files) from version control.

## 1. Network & edge

1. **Upgrade Cloudflare from Flexible to Full (strict) TLS.** Flexible encrypts only
   browser→Cloudflare; origin traffic is plaintext. Full (strict) requires a valid origin cert.
   Add `Strict-Transport-Security` so browsers never even try plaintext.
2. **Origin pull authentication** (Cloudflare mTLS): the origin only accepts connections that
   present Cloudflare's client certificate. Everything else is rejected at nginx before it
   touches the app.
3. **Hide the origin IP.** Check DNS history, SPF records, and any host-sent email headers for
   leaks of the origin address. If it has ever leaked, rotate it — a leaked origin IP lets
   attackers bypass Cloudflare entirely.
4. **Cloudflare rules on the login route:** a rate-limiting rule (e.g. 10 requests/10 s per IP →
   challenge or block), the managed challenge ("I'm Under Attack") during incidents, and Turnstile
   for bot-heavy periods. Edge-level blocking saves the app from ever seeing the traffic.
5. **IP allowlisting.** Restrict the host (or at minimum the login route) to the operators'
   IPs/VPN. For a small team this is the single strongest control. Keep a break-glass path for
   emergencies (e.g. a second, separately-named host).
6. **Host firewall** (ufw/iptables/nftables): allow 80/443 only from Cloudflare's published edge
   ranges; deny everything else. DB ports stay loopback-bound — audit this regularly.
7. **nginx hardening:** `server_tokens off`, `limit_conn` per IP, `client_body_timeout`,
   `client_max_body_size` (already 256 MB for imports), reject requests with unknown `Host`
   headers (DNS rebinding, §4.9).

## 2. Login & brute force

The login form **is** the perimeter now that the old `/access` cookie gate is removed. Treat it
as the highest-value target on the host.

1. **Rate limiting in tiers** — a coarse nginx `limit_req` cut (e.g. 10 req/min/IP on the login
   POST) plus an app-level counter with finer policy:
   - Login POST: 5 attempts/min/IP, 20/hour/IP.
   - Per-username: 5 attempts/10 min.
   - Respond `429` with `Retry-After`; escalate: slow down → temporary ban → CAPTCHA challenge →
     longer ban. Counters can live in the existing in-memory session map for a single instance;
   a multi-instance deployment needs a shared store (Redis) or sticky routing.
2. **Account lockout.** After N failures for a username, refuse that username for T minutes even
   with a correct password. This breaks password spraying of the shared `root`/`postgres`
   accounts. Beware the inverse — lockout is also a DoS lever against the operators themselves:
   exempt allowlisted IPs from lockout, and let IP throttling fire before username lockout.
3. **No user enumeration.** Today a failed MariaDB login echoes
   `Access denied for user 'root'@'localhost'`, which tells an attacker whether a username
   exists. Replace all login failures with one generic message ("Invalid credentials") and keep
   the real driver error only in the server-side audit log.
4. **Timing equalization.** Driver auth timing differs between "user exists, wrong password" and
   "user does not exist". Do a fixed dummy bcrypt (or a constant sleep) on every failed attempt
   so response time leaks nothing.
5. **Honeypot field.** A hidden form field that real users never fill. Any login containing it is
   silently dropped and logged as a bot — no error, no further work.
6. **CAPTCHA.** Cloudflare Turnstile on the login form (invisible to humans). Enable always for
   public exposure, or after M failures per IP.
7. **2FA/TOTP** — the single biggest recommendation for public exposure. An app-level TOTP step
   (e.g. `otplib`) after the DB password, with QR enrollment and recovery codes. TOTP also
   protects the "shared login" case: each operator's authenticator is theirs even when the DB
   account is shared.
8. **Session hardening:**
   - Shorten idle TTL (30 m → 10 m) and keep the absolute cap; sessions are in-memory today,
     which is good (restart wipes everything) but means multi-instance deployments need a shared
     session store or sticky routing.
   - Make **Permanent login default OFF** (it retains DB credentials server-side); if kept, cap
     it shorter and warn about shared machines.
   - Session fixation is already avoided (a fresh random id is issued at login); add a
     "log out everywhere" that invalidates all sessions for a user.
9. **Log every attempt** — timestamp, real client IP (from `CF-Connecting-IP`, never the edge IP),
   username, outcome, User-Agent. Alert on lockout/429 spikes. Fail2ban or Crowdsec can consume
   these logs.

## 3. Application hardening

1. **SQL injection:** queries are already parameterized. Make it enforced: a CI grep/semgrep rule
   that fails on string-built SQL (`` pool.query(`...${``), and keep `multipleStatements` off the
   shared pool — the SQL box already uses a dedicated connection.
2. **XSS:** EJS escapes by default. Audit every `<%-` (intentionally-raw) usage. Move any inline
   `<script>` blocks into static files so a strict CSP can be applied (this also matters for
   open-source: contributors must not add inline JS).
3. **Content-Security-Policy** (nginx header), e.g.:
   `default-src 'self'; script-src 'self' https://code.jquery.com https://cdn.jsdelivr.net;
   style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data:;
   frame-ancestors 'none'`
   — blocks inline scripts entirely, which kills reflected-XSS dead.
4. **Other response headers:** `X-Content-Type-Options: nosniff`,
   `Referrer-Policy: no-referrer`, `Permissions-Policy` (empty/minimal),
   `Cache-Control: no-store` on **every** app response — database data and login pages must never
   be cached by Cloudflare, proxies, or the browser.
5. **The SQL box is the crown jewel** — it executes arbitrary SQL as the logged-in DB user.
   - Pre-execution warning when a statement matches destructive patterns
     (`DROP`, `TRUNCATE`, `DELETE`, `UPDATE` without `WHERE`, `ALTER`) — not just a confirm.
   - A per-session **read-only mode** toggle that rejects mutating statements at the app layer.
   - Query timeouts: PostgreSQL already has `statement_timeout`; add MariaDB
     `max_statement_time` and a way to kill a runaway query; keep the 1000-row result cap.
   - At the DB layer, revoke `FILE` (blocks `SELECT ... INTO OUTFILE` / `LOAD_FILE`) and
     `SUPER`/`SYSTEM_VARIABLES_ADMIN` from the accounts the panel logs in with.
6. **Least-privilege DB accounts.** Stop using `root`/`postgres` day-to-day. Create per-person
   DB logins, a read-only role for browsing, and keep the admin role for change days. The panel's
   own user-management page makes this routine.
7. **SQLite path allowlist.** Today any readable path is accepted (Adminer parity). For public
   exposure, restrict to configured directories, `realpath`-resolve the input, and verify the
   result is inside the allowlist — no traversal, no `/etc/passwd` surprises. SQLite files carry
   no password of their own: the panel login is the only gate for them, so treat SQLite
   exposure as exactly as trusted as the panel itself — the allowlist here is mandatory for
   SQLite if the panel is public.
8. **Export/import.** Exports are an exfiltration path: audit every export (who/what/when) and
   rate-limit it. Imports execute arbitrary SQL: treat them as destructive (same confirmation
   gate). Keep the 256 MB cap and add a hard timeout. Cap the `/download` blob route's response
   size too, so a multi-GB BLOB cannot be pulled through the app.
9. **Error pages.** No stack traces, no SQL echo in production (`SHOW_FULL_ERRORS` stays false);
   404/500 pages stay generic and unbranded.

## 4. Host & platform

1. **Runtime and OS updates.** Track Bun releases (runtime CVEs are in scope here); enable
   `unattended-upgrades` on the OS; restart the service on update.
2. **Dependencies.** Commit the lockfile, run `bun audit`/`npm audit` in CI, pin versions.
3. **Secrets.** None in the repo today (DB passwords are typed at login). Any future secret
   (keys, SMTP) goes through env/secrets injection — never a config file in git.
4. **Filesystem.** Service user is `www-data`; any credential files 0600; dumps/backups never
   written inside the docroot; SQLite data files never under the static `/assets` path.
5. **Audit logging.** Append-only log of: logins (success/fail), SQL executed (at least the first
   N characters), exports, and user-management actions — with real client IP and timestamps.
   Retention policy + alerting on anomalies.
6. **Intrusion detection.** Fail2ban or Crowdsec on nginx/app logs: alert on 429 spikes,
   lockouts, and suspicious SQL (`INTO OUTFILE`, `information_schema` sweeps).
7. **DNS rebinding.** Validate the `Host` header at nginx (allow only the real hostnames). A
   malicious domain pointed at the origin could otherwise reach the panel from a browser on the
   same network.
8. **Log injection.** Sanitize newlines/ANSI escapes in anything logged from user input
   (usernames, SQL) so attackers can't forge log lines.

## 5. Open-source hygiene

1. `SECURITY.md` with a reporting address and response expectations.
2. No default credentials, no hardcoded secrets, no example passwords anywhere (CI check for
   secret patterns).
3. CI security pipeline: semgrep/CodeQL, dependency audit, secret scanning, on every PR.
4. Documentation states plainly: this is a powerful tool; default guidance is "not exposed to
   the public internet".
5. Signed git tags / build provenance for releases.

## 6. Prioritized checklist

**P0 — before any public exposure**
- [ ] Full (strict) TLS — a Cloudflare setting (HSTS header shipped in-app ✅)
- [ ] nginx `limit_req` on login (app-level rate limiting shipped instead ✅)
- [x] Generic login errors (no user enumeration) + timing equalization (1 s failure delay)
- [x] App-level login rate limit + account lockout
- [x] `Cache-Control: no-store` + security headers (CSP, nosniff, frame-ancestors)
- [ ] Least-privilege DB accounts (stop using root/postgres daily) — an ops task, not code
- [x] Permanent login default OFF; shorter session TTL

**P1 — strong public posture**
- [ ] 2FA/TOTP
- [ ] IP allowlist / VPN
- [ ] Cloudflare Turnstile + managed challenge on login
- [ ] SQL-box destructive-keyword warning + read-only mode + timeouts
- [ ] SQLite path allowlist
- [ ] Export auditing + rate limiting
- [ ] Fail2ban/Crowdsec + alerting
- [ ] Database server hardening (§8)
- [ ] Incident response runbook + one drill (§9)

**P2 — defense in depth**
- [ ] Origin pull mTLS
- [ ] WebAuthn/passkeys
- [ ] CI security pipeline + dependency auditing
- [ ] Encrypted off-site backups with restore drills
- [ ] Responsible-disclosure program

## 7. Where each control lives (file map)

| Control | File |
|---|---|
| nginx rate limits, headers, Host check | `/etc/nginx/snippets/dbxadm2-site.conf` |
| Login rate limit, lockout, generic errors, honeypot | `controllers/login.post.js` |
| Session TTL, logout-everywhere | `models/session.js` |
| SQL-box keyword warning, timeouts, read-only mode | `models/maria.js` `pgsql.js` `sqlite.js` `execute()` |
| SQLite allowlist | `config/config.js` + `models/sqlite.js` `open()` |
| Export audit + limits | `controllers/export.post.js` `controllers/select-action.post.js` |
| 2FA/TOTP | new model + controller (`otplib`) |
| CSP/headers | nginx snippet or a `server.js` middleware |

## 8. Database server hardening

The panel's safety cannot exceed the DB servers' own configuration. Independent of the app:

**MariaDB**
- `bind-address=127.0.0.1` (already) — audit regularly; never expose 3306.
- `local_infile=OFF` — blocks client-side file reads via `LOAD DATA LOCAL INFILE`.
- `--skip-symbolic-links` — blocks symlink-based file tricks.
- `max_connect_errors` — DB-side throttling of connection storms.
- Keep `root` on `unix_socket` auth for local admin; give the panel a dedicated admin account
  (with `FILE`/`SUPER` revoked) instead of root.
- Remove anonymous users and test databases (the `mysql_secure_installation` checklist).
- Consider the audit plugin or `log_warnings=2` for server-side connection/query logging.

**PostgreSQL**
- `listen_addresses='localhost'` (already).
- pg_hba: no `trust` entries anywhere; `scram-sha-256` for TCP; `peer` for the local socket admin.
- Panel roles: `NOSUPERUSER`, `NOCREATEROLE` where possible; revoke `pg_read_server_files` /
  `pg_write_server_files` / `pg_execute_server_program` from panel roles.
- `log_connections=on`, `log_disconnections=on`, `log_statement='ddl'` (or `all` while tuning).
- A server-level `statement_timeout` default in addition to the app's.

**SQLite**
- `PRAGMA trusted_schema=OFF` on connections (defense-in-depth against view/trigger tricks).
- Keep data files out of the docroot (already the rule); WAL/SHM sidecar files are normal — never
  serve the data directory.
- `bun:sqlite` has no built-in encryption. If a SQLite file holds secrets on a shared server,
  consider SQLCipher at the application layer or full-disk encryption.

## 9. Incident response runbook

1. **Detect** — alert sources: fail2ban/Crowdsec, 429 spikes, lockouts, unusual SQL in the audit
   log, Cloudflare analytics.
2. **Contain** — Cloudflare "I'm Under Attack" mode; block the source ASN/country; nginx deny or
   firewall-drop the IPs; invalidate all sessions (a service restart does this — sessions are
   in-memory); rotate the affected DB passwords; snapshot the database immediately.
3. **Investigate** — pull the audit log (logins, SQL, exports) for the window before the first
   alert; check `SHOW PROCESSLIST` / `pg_stat_activity` for lingering attacker connections;
   check for new DB users/roles, grants, triggers, `INTO OUTFILE` artifacts, and cron/systemd
   changes on the host.
4. **Recover** — restore from the latest good backup if data was touched; verify integrity;
   rotate every credential the panel or DBs ever saw.
5. **Learn** — write a short postmortem; add the detection that failed (or was missing) to the
   checklist and the monitoring.

## 10. Additional review notes

- **No state changes via GET** — every destructive/mutating route is POST-only (`/delete`,
  `/drop`, `/processlist`, `/privileges`, `/edit`, `/insert`, `/select-action`). Keep it that
  way; CSRF tokens only protect POSTs.
- **Framework `sid` cookie** — BriskMVC also sets its own `sid` cookie; it is unused by Bunminer
  Panel and harmless, but confirm it carries Secure/HttpOnly on the public host during the
  hardening pass.
- **Rate-limit counters are per-process** — a restart clears them. Acceptable for a single
  instance, but attackers can ride across restarts; move counters to a small SQLite table or
  Redis if this becomes a problem.
- **Mass assignment** — insert/edit form fields become column names; they are quoted
  identifiers (not injectable), and an authenticated user is entitled to edit their own
  database. Documented, no change needed.
- **Duplicate query parameters** — `URLSearchParams` keeps the last value; nothing trusts
  repeated parameters. Documented, low risk.
- **Passwords in logs** — the SQL history stores statement text only; the audit log must never
  store request bodies; `briskmvc/errors.js` already redacts password/key lines — extend the
  same redaction to any new audit writer.
- **Login page server list** — the login page shows configured server names (no credentials);
  acceptable, but keep the labels generic (no hostnames/ports) if the host is public.
