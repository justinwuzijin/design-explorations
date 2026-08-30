import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const PUBLIC_DIR = at('./public');

/**
 * Serve `public/<sketch>/index.html` for `/<sketch>/` in dev.
 *
 * Vite's dev server does no directory-index resolution inside publicDir, so
 * every static sketch URL would otherwise hit the SPA fallback and silently
 * render the gallery instead. Static hosts (and `vite preview`) resolve these
 * themselves, so this only matters for `bun dev` — but without it the sketches
 * are unreachable locally.
 */
function publicDirIndex(): Plugin {
  return {
    name: 'public-dir-index',
    configureServer(server) {
      // Registered in configureServer's non-returning form, so it runs before
      // Vite's internal middlewares — in particular before the SPA fallback.
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? '';
        const [pathname, query = ''] = url.split(/(?=\?)/, 2);

        if (pathname && !pathname.includes('..') && !path.extname(pathname)) {
          const withSlash = pathname.endsWith('/') ? pathname : `${pathname}/`;
          const candidate = path.join(PUBLIC_DIR, withSlash, 'index.html');
          if (candidate.startsWith(PUBLIC_DIR) && fs.existsSync(candidate)) {
            req.url = `${withSlash}index.html${query}`;
          }
        }

        next();
      });
    },
  };
}

// The three React explorations keep their own package.json + vite.config so they
// can still be run standalone (`cd dialkit && bun install && bun dev`). The shell
// pulls their source in directly via these aliases, so there is only ever one
// install, one dev server, and no committed dist/ to keep in sync.
export default defineConfig({
  plugins: [react(), publicDirIndex()],
  resolve: {
    alias: {
      '@shell': at('./src'),
      '@soccer-curve': at('./dialkit/src'),
      '@design-tiles': at('./design-tiles'),
      '@envelope': at('./envelope/src'),
    },
  },
  server: { port: 5173 },
  // three.js pushes the soccer-curve chunk past the default 500 kB warning.
  // That chunk is already split out and only fetched on its own route.
  build: { chunkSizeWarningLimit: 1000 },
});
