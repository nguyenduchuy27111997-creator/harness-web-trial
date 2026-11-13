import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false, // keeps the dev badge out of screenshots
  experimental: {
    serverActions: { bodySizeLimit: "2mb" }, // a 1 MB import file or its text fits (docs/design/M7.md)
  },
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
