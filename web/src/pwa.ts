import type { VitePWAOptions } from 'vite-plugin-pwa';

export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'autoUpdate',
  includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
  manifest: {
    name: 'Life Tracker',
    short_name: 'Life Tracker',
    description: 'Personal planner and tracker',
    display: 'standalone',
    start_url: '/',
    scope: '/',
    theme_color: '#3f51b5',
    background_color: '#f6f6f3',
    icons: [
      { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Something came up', url: '/quick-add' },
      { name: 'Daily review', url: '/review' },
    ],
  },
  workbox: {
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//],
    globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
    runtimeCaching: [],
  },
};
