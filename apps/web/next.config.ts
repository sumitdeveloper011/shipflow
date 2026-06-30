import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@shipflow/api", "@shipflow/db"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "github.com" },
    ],
  },
};

export default nextConfig;
