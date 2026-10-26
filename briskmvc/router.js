import fs from 'fs';
import path from 'path';
import { buildContext } from './context.js';

function fileToRoute(filePath, controllersDir) {
	const rel = path.relative(controllersDir, filePath).replace(/\\/g, '/');
	let noExt = rel.replace(/\.js$/, '');
	noExt = noExt.replace(/\.(get|post|put|delete)$/i, '');
	let route = '/' + noExt;
	route = route.replace(/\/index$/, '');
	return route === '' ? '/' : route;
}

function methodFromFilename(name) {
	const parts = name.split('.');
	if (parts.length > 2) {
	const m = parts[parts.length - 2].toLowerCase();
	if (['get', 'post', 'put', 'delete'].includes(m)) return m.toUpperCase();
	}
	return 'GET';
}

export function loadRoutes(app, { BASEPATH }) {
	const CONTROLLERS_DIR = path.join(BASEPATH, 'controllers');
	const stack = [CONTROLLERS_DIR];

	while (stack.length) {
	const dir = stack.pop();
	const entries = fs.readdirSync(dir, { withFileTypes: true });

	for (const entry of entries) {
		const full = path.join(dir, entry.name);

		if (entry.isDirectory()) {
		stack.push(full);
		continue;
		}

		if (!entry.name.endsWith('.js')) continue;

		const method = methodFromFilename(entry.name);
		const routePath = fileToRoute(full, CONTROLLERS_DIR);

		const register = {
		GET: app.get.bind(app),
		POST: app.post?.bind(app) || app.route.bind(app),
		PUT: app.put?.bind(app) || app.route.bind(app),
		DELETE: app.delete?.bind(app) || app.route.bind(app)
		}[method];

		// parse:none so Elysia never consumes the request body — context.js handles all parsing
		const routeOpts = (method === 'POST' || method === 'PUT') ? { parse: "none" } : undefined;
		register(routePath, async ctx => {
		const mod = await import(full + `?t=${Date.now()}`);
		const handler = mod.default;

		const headers = new Headers();
		const bodyFromCtx = ctx.body ?? null;

		const { w, VIEW } = await buildContext(
			ctx.request,
			headers,
			full,
			bodyFromCtx,
			{ BASEPATH },			 // ← critical for symlink safety
			ctx.cookie
		);

		w.requestUrl = ctx.request.url;

		try {
			const result = await handler({ ...ctx, w, VIEW });

			for (const [key, value] of headers.entries()) {
				ctx.set.headers[key.toLowerCase()] = value;
			}

			return result;

		} catch (err) {
			err.requestUrl = w.requestUrl;
			throw err;
		}
		}, routeOpts);
	}
	}
}
