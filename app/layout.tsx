import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/src/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestor FLACSO Google Meet",
  description: "Gestión ligera de solicitudes, agenda y asistencia para Google Meet.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "FLACSO Meet",
    statusBarStyle: "default"
  },
  icons: {
    icon: "/icon-192x192.png",
    apple: "/apple-touch-icon.png"
  }
};

export const viewport: Viewport = {
  themeColor: "#0f6f8f",
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
