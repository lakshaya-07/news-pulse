import type { NextConfig } from "next";

const apiUpstream =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:43101";

const nextConfig: NextConfig = {
  async rewrites() {
    // Same-origin proxy so the browser works behind Cursor/Vercel port forwarding
    // without needing the API host exposed separately.
    return [
      {
        source: "/news-api/:path*",
        destination: `${apiUpstream.replace(/\/$/, "")}/:path*`,
      },
    ];
  },
};

export default nextConfig;
