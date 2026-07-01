import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@cursor/sdk",
    "@xenova/transformers",
    "onnxruntime-node",
  ],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
