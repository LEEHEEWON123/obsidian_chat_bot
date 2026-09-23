import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@xenova/transformers",
    "onnxruntime-node",
  ],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
