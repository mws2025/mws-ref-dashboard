import type { NextConfig } from "next"
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare"

// Makes Cloudflare bindings (KV, secrets, .dev.vars) available under `next dev`.
initOpenNextCloudflareForDev()

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "a.ppy.sh",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "flagcdn.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
  reactCompiler: true,
}

export default nextConfig
