import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: [
    '@xenova/transformers', // Don't bundle - has Node.js-specific dynamic requires
    '@libsql/client', // Don't bundle - has Node.js-specific requires
  ],
});
