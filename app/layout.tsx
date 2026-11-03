import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BRAND } from "@/lib/brandConfig";

export const metadata: Metadata = {
  title: BRAND.appName,
  description: BRAND.appDescription,
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: { url: "/favicon-180.png", sizes: "180x180" },
  },
};

// Without this, mobile browsers render the page at a virtual desktop width
// (~980px) and scale the whole thing down to fit the screen — every sm:/md:
// breakpoint then evaluates against that fake width instead of the real
// device width, so two-column layouts (e.g. JourneyLegDetail's Pickup/
// Destination and Passengers/Date rows) incorrectly render side-by-side and
// cramped even on an actual phone.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang={BRAND.locale}>
      <body className="min-h-screen text-slate-800 antialiased">
        {children}
      </body>
    </html>
  );
}
