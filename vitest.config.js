import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,mjs}'],
    // tests/semelle3d/ : tests du noyau 3D écrits avec node:test, lancés par tests/semelle3d-noyau.test.mjs
    exclude: ['**/node_modules/**', 'tests/semelle3d/**'],
  },
});
