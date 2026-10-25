import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const BASE = "/travelplanner/";

export default defineConfig({
  base: BASE,
  server: {
    // `npm run dev:api` runs the Worker (auth, sync) on :8787
    proxy: { "/travelplanner/api": { target: "http://localhost:8787", ws: true } },
  },
  build: {
    // Served by the Worker at adityajain.ca/travelplanner/*, so assets live under dist/travelplanner
    outDir: "dist/travelplanner",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  plugins: [
    // Library workers shipped as ?url assets (MapLibre, pdf.js) end with a sourceMappingURL comment
    // pointing at a .map file that isn't emitted; strip it so devtools doesn't log a 404.
    {
      name: "strip-asset-sourcemap-comments",
      generateBundle(_, bundle) {
        for (const f of Object.values(bundle))
          if (f.type === "asset" && f.fileName.endsWith(".mjs"))
            f.source = String(f.source).replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, "\n");
      },
    },
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Atlas Journeys",
        short_name: "Atlas Journeys",
        description: "Offline-first trip planner: itineraries, maps, bookings and budgets",
        start_url: BASE,
        scope: BASE,
        display: "standalone",
        background_color: "#0e1110",
        theme_color: "#0e1110",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: `${BASE}index.html`,
        navigateFallbackDenylist: [/\/api\//],
        globPatterns: ["**/*.{js,mjs,css,html,svg,png,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // Place photos (Wikipedia / Commons / Openverse thumbnails) stay available offline
            urlPattern: ({ url }) => url.hostname === "upload.wikimedia.org" || url.hostname === "images.unsplash.com" || (url.hostname === "places.googleapis.com" && url.pathname.endsWith("/media")) || (url.hostname === "api.openverse.org" && url.pathname.endsWith("/thumb/")),
            handler: "CacheFirst",
            options: {
              cacheName: "place-photos",
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Vector basemap tiles: anything you've looked at online stays available offline
            urlPattern: ({ url }) => url.hostname === "api.protomaps.com",
            handler: "CacheFirst",
            options: {
              cacheName: "basemap-tiles",
              expiration: { maxEntries: 20000, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Map fonts + sprites
            urlPattern: ({ url }) => url.hostname === "protomaps.github.io",
            handler: "CacheFirst",
            options: {
              cacheName: "basemap-assets",
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Satellite imagery is online-first; a small cache softens flaky connections
            urlPattern: ({ url }) => url.hostname === "api.maptiler.com",
            handler: "NetworkFirst",
            options: {
              cacheName: "satellite-tiles",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
