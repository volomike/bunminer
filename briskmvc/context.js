// briskmvc/context.js (patched: buffered cookies + flush helper + Response/string-safe renderView)

import path from 'path';
import fs from 'fs';
import { loadConfig } from './config.js';
import { models, createModels } from './models.js';
import { renderViewAuto } from './view.js';
// Project version — read from config (set by cordoba-autoversion.sh on restart)
let CORDOVA_VERSION = 'dev';
try {
  const cfg = loadConfig({ BASEPATH: path.resolve(import.meta.dir, '..') });
  if (cfg.VERSION) CORDOVA_VERSION = cfg.VERSION;
} catch(e) {
  CORDOVA_VERSION = 'dev';
}

// Session store disabled 2026-11-02: this Map was never evicted (one permanent
// entry per unique sid) and nothing in the app reads w.session. It drove the
// process toward the 2 GB MemoryHigh ceiling under sustained traffic. Kept,
// commented, for reference.
// const sessionStore = new Map();

function computeBaseUrl(request) {
    const h = request.headers;
    const xfProto = h.get('x-forwarded-proto');
    const xfHost = h.get('x-forwarded-host');
    const xfPort = h.get('x-forwarded-port');

    if (xfProto && xfHost) {
        const port =
            xfPort && !['80', '443'].includes(xfPort) ? `:${xfPort}` : '';
        return `${xfProto}://${xfHost}${port}`;
    }

    const url = new URL(request.url);
    const isDefault =
        (url.protocol === 'http:' && url.port === '80') ||
        (url.protocol === 'https:' && url.port === '443') ||
        url.port === '';
    const port = isDefault ? '' : `:${url.port}`;
    return `${url.protocol}//${url.hostname}${port}`;
}

async function runAutoRequest(w, VIEW, BASEPATH, cookie) {
    try {
        const autoRequestPath = path.join(
            BASEPATH,
            'controllers',
            '_autorequest.js',
        );
        if (!fs.existsSync(autoRequestPath)) return;
                const mtimeMs = fs.statSync(autoRequestPath).mtimeMs;
        if (runAutoRequest.__cache?.path !== autoRequestPath || runAutoRequest.__cache.mtimeMs !== mtimeMs) {
            runAutoRequest.__cache = { path: autoRequestPath, mtimeMs, mod: await import(`${autoRequestPath}?v=${mtimeMs}`) };
        }
        const mod = runAutoRequest.__cache.mod;
        if (mod?.default) await mod.default({ w, VIEW, cookie });
    } catch (err) {
        console.error('AUTOREQUEST ERROR:', err);
    }
}

function parseCookies(header) {
    if (!header) return {};
    return Object.fromEntries(
        header
            .split(';')
            .map(c => c.trim().split('='))
            .filter(([k]) => k)
            .map(([k, v]) => [k, decodeURIComponent(v || '')]),
    );
}

function getRootDomain(sUrl) {
    try {
        const { hostname } = new URL(sUrl);
        const aoMatch = hostname.match(
            /(?:^|\.)([\w-]+\.(?:\w{2,}|\w{2}\.\w{2}))$/,
        );
        if (aoMatch) {
            return aoMatch[1].toLowerCase();
        }
    } catch (e) {}
    return undefined;
}

export async function buildContext(
    request,
    headers,
    controllerPath,
    bodyFromCtx = null,
    options = {},
    cookieObj = {},
) {
    const { BASEPATH } = options;
    if (!BASEPATH) throw new Error('BASEPATH is required in buildContext options');

    const v = {};
    const BASEURL = computeBaseUrl(request).split('http://').join('https://');
    const url = new URL(request.url);
    const getParams = Object.fromEntries(url.searchParams.entries());

    const incomingCookies = parseCookies(request.headers.get('cookie'));
    let sid = incomingCookies.sid || crypto.randomUUID();
    // const isNewSession = !sessionStore.has(sid);
    // if (isNewSession) sessionStore.set(sid, {});
    // const session = sessionStore.get(sid);
    // No-op session object: w.session stays defined for any future caller, but
    // nothing is retained between requests.
    const session = {};

    // Always ensure sid is set (new or refresh)
    // Keep this early append for session continuity; note: don't also push sid into cookieBuffer unless you intend to overwrite it later.
    headers.append(
        'Set-Cookie',
        `sid=${sid}; Path=/; HttpOnly; SameSite=Lax`,
    );

    let post = {};
    let posttype = null;
    let rawBody = null;
    let files = {};

    const method = request.method.toLowerCase();

    // ---------- BODY PARSING ----------
    if (['post', 'put', 'patch'].includes(method)) {
        const contentType = (
            request.headers.get('content-type') || ''
        ).toLowerCase();

        // Multipart: always parse from raw request (Elysia body parser is off for auto-loaded routes)
        if (contentType.includes('multipart/form-data')) {
            const form = await request.formData();
            const data = {};
            const fileMap = {};

            for (const [key, value] of form.entries()) {
                if (value instanceof File) {
                    fileMap[key] = {
                        filename: value.name,
                        type: value.type,
                        size: value.size,
                        arrayBuffer: () => value.arrayBuffer(),
                    };
                } else {
                    data[key] = value;
                }
            }

            post = data;
            files = fileMap;
            posttype = 'form';
            rawBody = null;
        } else if (bodyFromCtx != null) {
            post = bodyFromCtx;
            posttype = 'json';
            try {
                rawBody =
                    typeof bodyFromCtx === 'string'
                        ? bodyFromCtx
                        : JSON.stringify(bodyFromCtx);
            } catch {
                rawBody = null;
            }
        } else {
            rawBody = await request.text();

            if (contentType.includes('application/json')) {
                try {
                    post = rawBody ? JSON.parse(rawBody) : {};
                } catch {
                    post = {};
                }
                posttype = 'json';
            } else if (
                contentType.includes('application/x-www-form-urlencoded')
            ) {
                const params = new URLSearchParams(rawBody || '');
                post = Object.fromEntries(params.entries());
                posttype = 'form';
            } else {
                post = {};
                posttype = 'unknown';
            }
        }
    }
    // ---------- END BODY PARSING ----------

    function xtimeid() {
        const b = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const EPOCH_MS = 1735689600000;
        const timeOriginMs = performance.timeOrigin;
        const uptimeNs = Bun.nanoseconds();
        const nowNsApprox = timeOriginMs * 1_000_000 + uptimeNs;
        const epochNs = EPOCH_MS * 1_000_000;
        const deltaNs = Math.floor(nowNsApprox - epochNs);
        let s = '';
        let n = deltaNs;
        if (n <= 0) {
            s = '0';
        } else {
            while (n > 0) {
                s = b[Math.floor(n % 62)] + s;
                n = Math.floor(n / 62);
            }
        }
        return s.padStart(10, '0');
    }

    await createModels({ BASEPATH });
    const mtemp = models;

    v.BASEURL = BASEURL;
    v.BASEPATH = BASEPATH;
    v.RANDOMID = (
        Math.random().toString(16).slice(2) +
        Math.random().toString(16).slice(2)
    ).substring(0, 16);
    v.TIMEID = xtimeid();
    v.SESSIONID = sid;
    v.CORDOVA_VERSION = CORDOVA_VERSION;

    // ============================================================
    // COOKIE BUFFER (per-request)
    // ============================================================
    const cookieBuffer = [];

    // ============================================================
    // Cookie string builder and flush helper
    // ============================================================
    function buildCookieString(name, value, opts = {}) {
        const sDerivedDomain = '.' + getRootDomain(BASEURL);
        const isHTTPS = BASEURL.startsWith('https://');

        const parts = [
            `${name}=${encodeURIComponent(value)}`,
            `Path=${opts.path ?? '/'}`,
            opts.sameSite ? `SameSite=${opts.sameSite}` : 'SameSite=Lax',
        ];

        // HttpOnly default true unless explicitly false
        if (opts.httpOnly === false) {
            // omit HttpOnly
        } else {
            parts.push('HttpOnly');
        }

        // Secure default true on https
        if (opts.secure === false) {
            // omit Secure
        } else if (isHTTPS) {
            parts.push('Secure');
        }

        if (opts.maxAge !== undefined) {
            parts.push(`Max-Age=${opts.maxAge}`);
        } else {
            parts.push(`Max-Age=${100 * 365 * 24 * 60 * 60}`);
        }

        if (opts.domain === false) {
            // explicit opt-out of domain attribute
        } else if (opts.domain) {
            parts.push(`Domain=${opts.domain}`);
        } else if (sDerivedDomain) {
            parts.push(`Domain=${sDerivedDomain}`);
        }

        if (opts.expires instanceof Date) {
            parts.push(`Expires=${opts.expires.toUTCString()}`);
        }

        if (opts.sameSite && ['None', 'Lax', 'Strict'].indexOf(opts.sameSite) === -1) {
            // sanitize unknown sameSite values by removing
        }

        return parts.filter(Boolean).join('; ');
    }

    function flushCookiesIntoHeaders(targetHeaders) {
        for (const c of cookieBuffer) targetHeaders.append('Set-Cookie', c);
        // clear buffer so we don't double-flush
        cookieBuffer.length = 0;
    }

    // ============================================================
    // COOKIE ACCESSOR (getter + buffered setter)
    // ============================================================
    const createCookieAccessor = () => (name, value, opts = {}) => {
        // GETTER
        if (value === undefined) {
            const incoming = request.headers.get('cookie') || '';
            const parsed = parseCookies(incoming);
            return parsed[name];
        }

        // SETTER (buffer only)
        const cookieString = buildCookieString(name, value, opts);
        cookieBuffer.push(cookieString);

        return w;
    };

    // ============================================================

    const w = {
        req: request,
        res: headers,
        m: mtemp,
        models: mtemp,
        basepath: BASEPATH,
        baseurl: BASEURL,
        config: loadConfig({ BASEPATH }),
        v,
        view: v,
        get: getParams,
        post,
        posttype,
        rawBody,
        files,
        ecookie: cookieObj,

        // html/json/doRedirect will now create Responses that include buffered cookies
        html: str => {
            const finalHeaders = new Headers(headers);
            flushCookiesIntoHeaders(finalHeaders);
            return new Response(str, { headers: finalHeaders });
        },

        // By default JSON responses will flush cookies. If you prefer JSON responses not to set cookies,
        // change this to set Content-Type on headers and return the object/string instead.
        json: obj => {
            const finalHeaders = new Headers(headers);
            finalHeaders.set('Content-Type', 'application/json');
            flushCookiesIntoHeaders(finalHeaders);
            return new Response(JSON.stringify(obj), { status: 200, headers: finalHeaders });
        },

        header: (name, value) => headers.set(name, value),
        addHeader: (name, value) => headers.append(name, value),

        // FIXED: this now reads INCOMING headers, not response headers
        getHeader: name => request.headers.get(name.toLowerCase()),

        // Your cookie API (buffered)
        cookie: createCookieAccessor(),

        session,

        // Redirects should flush cookies as well
        doRedirect: (url, status = 302) => {
            const finalHeaders = new Headers();
            finalHeaders.set('Location', url);
            flushCookiesIntoHeaders(finalHeaders);
            return new Response('', { status, headers: finalHeaders });
        },

        // ============================================================
        // FINAL RESPONSE CREATION (COOKIE FLUSH POINT) for renderView
        // ============================================================
        renderView: async (overrideView = null) => {
            // Call renderViewAuto and capture whatever it returns (string or Response)
            const result = await renderViewAuto(
                controllerPath,
                { VIEW: v },
                overrideView,
                headers,
                { BASEPATH },
            );

            // If renderViewAuto returned a Response, merge cookies into that Response
            if (typeof Response !== 'undefined' && result instanceof Response) {
                // Read body text (consumes the response)
                const body = await result.text();

                // Clone headers from the returned Response into a fresh Headers
                const finalHeaders = new Headers(result.headers);

                // Append buffered cookies and clear buffer
                flushCookiesIntoHeaders(finalHeaders);

                // Preserve status and statusText if present
                const status = result.status || 200;
                const statusText = result.statusText || undefined;

                return new Response(body, {
                    status,
                    statusText,
                    headers: finalHeaders,
                });
            }

            // Otherwise assume a string (HTML) was returned.
            // Flush cookies into the headers object you already use and return the string.
            flushCookiesIntoHeaders(headers);
            return result;
        },
    };

    // Expose native cookie if you need it (preserve user's existing reference)
    w.nativeCookie = request.cookie;

    globalThis.w = w;
    globalThis.VIEW = v;
    globalThis.die = function (msg, obj = null) {
        let dump = '';
        if (obj !== null) {
            try {
                dump = '\n\nDUMP:\n' + JSON.stringify(obj, null, 2);
            } catch {
                dump = '\n\nDUMP: [unserializable object]';
            }
        }
        const err = new Error(msg + dump);
        err.name = 'DUMP';
        throw err;
    };

    await runAutoRequest(w, v, BASEPATH, cookieObj);

    return { w, VIEW: v };
}



