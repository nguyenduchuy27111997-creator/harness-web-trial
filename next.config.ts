import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false, // keeps the dev badge out of screenshots
  experimental: {
    serverActions: { bodySizeLimit: "3mb" }, // a 2 MB cover or a 1 MB import file fits (docs/decisions/0020-cover-body-size-limit.md)
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
