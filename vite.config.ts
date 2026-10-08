import { defineConfig, type Plugin } from 'vitest/config';

/** `vite build --mode crazygames`: adds the CrazyGames HTML5 SDK v3 before the game script. */
const crazyGamesSdk = (): Plugin => ({
  name: 'crazygames-sdk',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) => html.replace('</head>', '    <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n  </head>'),
  },
});

export default defineConfig(({ mode }) => ({
  // relative paths: portals serve the build from their own sub-folders
  base: './',
  plugins: mode === 'crazygames' ? [crazyGamesSdk()] : [],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    outDir: mode === 'crazygames' ? 'dist-crazygames' : 'dist',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
