import staticPlugin from '@elysiajs/static';
import path from 'path';

export function setupStatic(app, { BASEPATH }) {
  app.use(
    staticPlugin({
      prefix: '/assets',
      assets: path.join(BASEPATH, 'views', 'assets')
    })
  );
}
