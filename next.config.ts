import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false, // keeps the dev badge out of screenshots
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
