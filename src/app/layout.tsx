import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";
import { PwaChrome } from "@/components/pwa-chrome";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Ledger — Cobb Family Legacy",
  description:
    "Family-office dashboard for the Cobb entities — Path to Change, PTC Havens, H&L holdings, CFS, personal.",
  manifest: "/manifest.json",
  applicationName: "The Ledger",
  appleWebApp: {
    capable: true,
    title: "The Ledger",
    statusBarStyle: "default",
  },
  // Private family-office tool — don't surface in search results.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/theledger-assets/logo.png", sizes: "256x256", type: "image/png" },
      { url: "/theledger-assets/PWA.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/theledger-assets/PWA.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/theledger-assets/logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <PwaRegister />
        <PwaChrome />
        {children}
      </body>
    </html>
  );
}
