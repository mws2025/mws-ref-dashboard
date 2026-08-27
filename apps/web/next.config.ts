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
        // guest/placeholder avatar for staff with no linked osu! account
        protocol: "https",
        hostname: "osu.ppy.sh",
        port: "",
        pathname: "/images/**",
      },
      {
        // beatmap cover art
        protocol: "https",
        hostname: "assets.ppy.sh",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "b.ppy.sh",
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
