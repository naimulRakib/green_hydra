import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure leaflet and react-leaflet are bundled for the browser (they use window/document)
  transpilePackages: ["leaflet", "react-leaflet", "@react-leaflet"],
  // Keep supabase out of the edge/browser SSR bundle — use it only in Node server context
  serverExternalPackages: ["@supabase/supabase-js", "@supabase/ssr"],
};

export default nextConfig;
