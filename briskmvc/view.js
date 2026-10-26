import fs from 'fs';
import path from 'path';
import ejs from 'ejs';

/**
 * Render a view automatically based on controller path.
 * Optionally override the view file.
 *
 * @param {string} controllerPath - Full path to the controller file
 * @param {Object} [data={}] - Data to pass to the EJS template (usually { VIEW })
 * @param {string|null} [overrideView=null] - Optional explicit view path (relative to views/)
 * @param {Headers|null} [headers=null] - If provided, returns Response with Content-Type set
 * @param {Object} options
 * @param {string} options.BASEPATH - **Required**: Project root path (for symlink-safe view resolution)
 */
export function renderViewAuto(
  controllerPath,
  data = {},
  overrideView = null,
  headers = null,
  { BASEPATH } = {}
) {
  if (!BASEPATH) {
    throw new Error(
      'BASEPATH is required in renderViewAuto options (needed for symlink-safe view resolution)'
    );
  }

  const VIEWS_DIR = path.join(BASEPATH, 'views');
  const CONTROLLERS_DIR = path.join(BASEPATH, 'controllers');

  let viewFile;
  if (overrideView) {
    viewFile = path.join(VIEWS_DIR, overrideView);
  } else {
    // Convert controller path → relative view path
    const rel = path.relative(CONTROLLERS_DIR, controllerPath).replace(/\\/g, '/');

    const noExt = rel.replace(/\.js$/, '');
    const dir = path.dirname(noExt);
    const base = path.basename(noExt);

    // v- prefix convention
    const viewName = `v-${base}.ejs`;

    // Handle root-level controllers (dir === '.') correctly
    const viewDir = dir === '.' ? '' : dir;
    viewFile = path.join(VIEWS_DIR, viewDir, viewName);
  }

  if (!fs.existsSync(viewFile)) {
    throw new Error(`View not found: ${viewFile}`);
  }

  const template = fs.readFileSync(viewFile, 'utf8');

  // Return the Promise — do NOT await here.
  const renderPromise = ejs.render(template, data, {
    filename: viewFile,
    async: true
  });

  // If headers are provided, wrap the promise to produce a Response
  if (headers) {
    return renderPromise.then(html => {
      headers.set('Content-Type', 'text/html; charset=utf-8');
      return new Response(html, { headers });
    });
  }

  // Otherwise return the Promise directly
  return renderPromise;
}


