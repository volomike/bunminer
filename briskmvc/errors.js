import { loadConfig } from './config.js';
import ejs from 'ejs';
import path from 'path';

export function createErrorHandler({ BASEPATH } = {}) {
  if (!BASEPATH) {
    throw new Error('BASEPATH is required for error handler (to load config correctly)');
  }

  function removePasswordLines(bShowFullErrors, s) {
    if (bShowFullErrors) {
      return s;
    }

    const lines = s.split(/\r\n|\n|\r/);

    const redacted = lines.map(line => {
      const lower = line.toLowerCase();
      if (lower.includes('pass') || lower.includes('key')) {
        return '--REDACTED-FOR-SECURITY--';
      }
      return line;
    });

    return redacted.join('\n');
  }

  return async ({ code, error, request }) => {
    const config = loadConfig({ BASEPATH });
    const bShowFullErrors = config.SHOW_FULL_ERRORS ?? false;

    const errorTemplatePath = path.join(BASEPATH, 'briskmvc', 'error.ejs');

    let status = 500;

    if (code === 'NOT_FOUND') {
      status = 404;
    } else if (typeof code === 'number' && code >= 200 && code <= 599) {
      status = code;
    }

    const url = request?.url || error?.requestUrl || 'unknown';

    console.error('ERROR:', error, 'URL:', url);

    let html;

    const VIEW = {};
    VIEW.FULL = bShowFullErrors;
    VIEW.NAME = error.name;
    VIEW.STATUS = status;
    VIEW.MESSAGE = removePasswordLines(bShowFullErrors, error.message);
    VIEW.STACK = error.stack;
    VIEW.URL = url;

    try {
      html = await ejs.renderFile(errorTemplatePath, { VIEW }, { async: true });
    } catch (renderErr) {
      console.error('Error rendering error page:', renderErr);
      html = `<h1>Internal Server Error</h1><p>${status}</p>`;
    }

    return new Response(html, {
      status,
      headers: { 'Content-Type': 'text/html' }
    });
  };
}
