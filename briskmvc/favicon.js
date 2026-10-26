import fs from 'fs';
import path from 'path';

export function setupFavicon(app, { BASEPATH }) {
  app.get('/favicon.ico', () => {
    const icoPath = path.join(BASEPATH, 'views', 'assets', 'favicon.ico');
    if (!fs.existsSync(icoPath)) {
      return new Response('', { status: 204 });
    }
    const ico = fs.readFileSync(icoPath);
    return new Response(ico, {
      status: 200,
      headers: { 'Content-Type': 'image/x-icon' }
    });
  });
}
