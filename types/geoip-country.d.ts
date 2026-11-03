// Minimal typing for the slice of geoip-country used in lib/localCurrency.ts —
// the package ships plain JS with no declarations of its own.
declare module "geoip-country" {
  interface GeoIpCountry {
    /** ISO 3166-1 alpha-2, e.g. "AE". */
    country: string;
    name: string;
    /** ISO 4217 codes in use there, primary first, e.g. ["AED"]. */
    currency: string[];
  }
  const geoip: { lookup(ip: string): GeoIpCountry | null };
  export default geoip;
}
