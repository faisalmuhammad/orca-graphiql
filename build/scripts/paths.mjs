import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

export const BUILD = fileURLToPath(new URL('..', import.meta.url));
export const PLUGIN = dirname(BUILD);
