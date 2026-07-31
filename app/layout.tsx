import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestor FLACSO Google Meet",
  description: "Gestion ligera de solicitudes, agenda y asistencia para Google Meet."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
