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

// design-tiles keeps its own package.json + vite.config so it can still be run
// standalone (`cd design-tiles && bun install && bun dev`). The shell pulls its
// source in directly via the alias, so there is only ever one install and one
// dev server.
export default defineConfig({
  plugins: [react(), publicDirIndex()],
  resolve: {
    alias: {
      '@shell': at('./src'),
      '@design-tiles': at('./design-tiles'),
    },
  },
  server: { port: 5173 },
});
