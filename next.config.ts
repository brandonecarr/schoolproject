import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the Turbopack workspace root to THIS project. Without it, Turbopack
  // climbs up and finds stray lockfiles (~/package-lock.json, the sibling
  // BrownList project) and mis-resolves `next` from the wrong node_modules.
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    serverActions: {
      // Default is 1MB. Blast image uploads are downscaled client-side to
      // ~hundreds of KB, but GIFs pass through untouched (resizing kills the
      // animation) up to the action's 4MB cap — plus multipart overhead.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
