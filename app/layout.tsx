import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/src/components/pwa-register";
import "driver.js/dist/driver.css";
import "./globals.css";
import "./brand.css";
import "./tour.css";

export const metadata: Metadata = {
  title: "Sala Virtual FLACSO",
  description: "Gestión de solicitudes, agenda y monitoreo para FLACSO Uruguay.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Sala Virtual FLACSO",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/app-logo.svg", type: "image/svg+xml" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2c4777",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
