// briskmvc/models.js

import { readdir } from 'fs/promises';
import { join } from 'path';

export const models = {};

export async function createModels(opts, changedFile = null) {
    const base = opts.BASEPATH;
    const modelsDir = join(base, 'models');

    if (changedFile) {
        const name = changedFile.replace('.js', '').replace(/-/g, '_');
        const fullPath = join(modelsDir, changedFile);
        const module = await import(`${fullPath}?t=${Date.now()}`);
        models[name] = module.default || module;
        return;
    }

    const files = await readdir(modelsDir);

    for (const file of files) {
        if (!file.endsWith('.js')) continue;

        const name = file.replace('.js', '').replace(/-/g, '_');
        const fullPath = join(modelsDir, file);

        const module = await import(fullPath);
        models[name] = module.default || module;
    }
}

export default createModels;

