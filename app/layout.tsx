import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/src/components/pwa-register";
import "./globals.css";
import "./brand.css";

export const metadata: Metadata = {
  title: "Sala Virtual FLACSO",
  description: "Gestión de solicitudes, agenda y asistencia técnica para FLACSO Uruguay.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Sala Virtual FLACSO",
    statusBarStyle: "default"
  },
  icons: {
    icon: "/icon-192x192.png",
    apple: "/apple-touch-icon.png"
  }
};

export const viewport: Viewport = {
  themeColor: "#163970",
  colorScheme: "light"
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
