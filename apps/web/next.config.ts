import { join } from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  turbopack: {
    root: join(__dirname, "../.."),
  },
};

export default nextConfig;
