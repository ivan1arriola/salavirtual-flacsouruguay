import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = readFileSync(
  new URL("../app/manifest.ts", import.meta.url),
  "utf8"
);
const serviceWorker = readFileSync(
  new URL("../public/sw.js", import.meta.url),
  "utf8"
);
const protectedLayout = readFileSync(
  new URL("../app/(gestion)/layout.tsx", import.meta.url),
  "utf8"
);

describe("contrato PWA y acceso", () => {
  it("declara una PWA instalable con iconos y modo standalone", () => {
    expect(manifest).toContain('display: "standalone"');
    expect(manifest).toContain("icon-192x192.png");
    expect(manifest).toContain("icon-512x512.png");
  });

  it("usa iconos PNG opacos: la transparencia se ve negra en el splash y en la pantalla de inicio", () => {
    for (const nombre of ["icon-192x192.png", "icon-512x512.png", "apple-touch-icon.png"]) {
      const png = readFileSync(new URL(`../public/${nombre}`, import.meta.url));
      const tipoColor = png[25]; // IHDR: 0 gris, 2 RGB, 3 paleta, 4 gris+alfa, 6 RGBA
      expect([4, 6]).not.toContain(tipoColor);
    }
  });

  it("no cachea APIs ni respuestas de navegacion autenticadas", () => {
    expect(serviceWorker).toContain('url.pathname.startsWith("/api/")');
    expect(serviceWorker).toContain('request.mode === "navigate"');
    expect(serviceWorker).toContain(
      'fetch(request).catch(() => caches.match("/offline.html"))'
    );
  });

  it("protege las rutas de gestion con una sesion", () => {
    expect(protectedLayout).toContain("await auth()");
    expect(protectedLayout).toContain('redirect("/acceso")');
  });
});
