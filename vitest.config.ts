import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Later tasks add server/ and web/; only include project dirs that exist.
const projects = ['shared', 'server', 'web', 'scripts'].filter((p) => existsSync(new URL(`./${p}`, import.meta.url)));

export default defineConfig({ test: { projects } });
