import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,

  // The Docker image runs the standalone build: a small server with only the
  // files it needs. See Dockerfile.
  output: "standalone",
  // Pin both roots to this folder. Without it Next.js picks up a stray
  // lockfile in a parent folder and treats that as the workspace root.
  outputFileTracingRoot: __dirname,
  // The share-card route reads these two files when it runs. The build cannot
  // see that by itself, so they are named here to be copied into the image.
  outputFileTracingIncludes: {
    "/opengraph-image": [
      "./brand/wordmark-dark.svg",
      "./node_modules/@fontsource/sora/files/sora-latin-500-normal.woff",
    ],
  },

  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
