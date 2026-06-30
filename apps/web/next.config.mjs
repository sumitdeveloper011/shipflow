/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@shipflow/api", "@shipflow/db"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "github.com" },
    ],
  },
};

export default nextConfig;
