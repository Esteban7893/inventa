import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/lib/security-headers";

const isDev = process.env.NODE_ENV === "development";

// En producción la CSP es obligatoria. En `next dev` se queda en report-only: el HMR y la
// superposición de errores no se han verificado con la política obligatoria, y así las
// violaciones salen en la consola sin romper el desarrollo.
const securityHeaders = buildSecurityHeaders({
  isDev,
  cspMode: isDev ? "report-only" : "enforce",
});

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
