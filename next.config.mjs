/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // geoip-country reads its bundled GeoLite2 data files from its own
  // package folder at runtime (lib/localCurrency.ts) — bundling it would
  // break those relative paths, so it's loaded straight from node_modules.
  serverExternalPackages: ["geoip-country"],
};

export default nextConfig;
