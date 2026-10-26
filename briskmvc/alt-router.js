import fs from 'fs';
import path from 'path';
import { buildContext } from './context.js';

function getControllerFile(urlPath, method, CONTROLLERS_DIR) {
  let cleanPath = urlPath.replace(/\/$/, '');
  let parts = cleanPath.split('/').filter(Boolean);
  let methodLower = method.toLowerCase();

  // Option 1: treat as file (e.g., /users -> controllers/users.js)
  if (parts.length > 0) {
    let dir = path.join(CONTROLLERS_DIR, parts.slice(0, -1).join(path.sep));
    let base = parts[parts.length - 1];
    let methodFile = path.join(dir, `${base}.${methodLower}.js`);
    let baseFile = path.join(dir, `${base}.js`);

    if (fs.existsSync(methodFile)) {
      return methodFile;
    } else if (method === 'GET' && fs.existsSync(baseFile)) {
      return baseFile;
    }
  }

  // Option 2: treat as directory with index (e.g., /users -> controllers/users/index.js)
  let indexDir = path.join(CONTROLLERS_DIR, parts.join(path.sep));
  let indexMethodFile = path.join(indexDir, `index.${methodLower}.js`);
  let indexBaseFile = path.join(indexDir, 'index.js');

  if (fs.existsSync(indexMethodFile)) {
    return indexMethodFile;
  } else if (method === 'GET' && fs.existsSync(indexBaseFile)) {
    return indexBaseFile;
  }

  return null;
}

export function loadRoutes(app, { BASEPATH }) {
  const CONTROLLERS_DIR = path.join(BASEPATH, 'controllers');

  app.all('*', async ctx => {
    const full = getControllerFile(ctx.path, ctx.method, CONTROLLERS_DIR);

    if (!full) {
      ctx.set.status = 404;
      return 'Not Found';
    }

    const mod = await import(full + `?t=${Date.now()}`);
    const handler = mod.default;

    const headers = new Headers();
    const bodyFromCtx = ctx.body ?? null;

    const { w, VIEW } = await buildContext(
      ctx.request,
      headers,
      full,
      bodyFromCtx,
      { BASEPATH }           // ← critical for symlink safety
    );

    w.requestUrl = ctx.request.url;

    try {
      const result = await handler({ ...ctx, w, VIEW });

      if (result instanceof Response) {
        return result;
      }

      // Fallback: assume it's content (string, object, etc.)
      return new Response(result, { headers });

    } catch (err) {
      err.requestUrl = w.requestUrl;
      throw err;
    }
  });
}

