import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["fetch-socks"],
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};
export default config;
