import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the Turbopack workspace root to THIS project. Without it, Turbopack
  // climbs up and finds stray lockfiles (~/package-lock.json, the sibling
  // BrownList project) and mis-resolves `next` from the wrong node_modules.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
