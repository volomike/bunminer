import { Elysia } from 'elysia';
import { createErrorHandler } from './errors.js';

export function createElysia({ BASEPATH }) {
  if (!BASEPATH) {
    throw new Error('BASEPATH is required to create Elysia app (needed for error handler)');
  }

  return new Elysia()
    .onError(createErrorHandler({ BASEPATH }));
}
