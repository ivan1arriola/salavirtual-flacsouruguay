import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { enviarAccionEncuentro } from "../src/modules/reuniones/reunion-zoom-acciones";
import { ReunionZoomEncuentros } from "../src/modules/reuniones/presentation/components/reunion-zoom-encuentros";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const leer = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");

const encuentro = (hostUrl: string | null) => ({
  id: "i1",
  solicitudId: "s1",
  inicioIso: "2099-10-10T10:00:00-03:00",
  finIso: "2099-10-10T11:00:00-03:00",
  descripcion: null,
  estado: "PROGRAMADA",
  editable: true,
  joinUrl: "https://zoom.us/j/1",
  hostUrl,
  estadoEnlace: "LISTO" as const,
  eventoProveedorId: "ev1",
  operacion: "PROVISIONAR" as const
});

function render(hostUrl: string | null) {
  return renderToStaticMarkup(createElement(ReunionZoomEncuentros, {
    solicitudIds: ["s1"],
    esAdmin: false,
    encuentros: [encuentro(hostUrl)]
  }));
}

describe("encuentros de una reunión Zoom", () => {
  it("no muestra 'Iniciar como anfitrión' sin hostUrl", () => {
    expect(render(null)).not.toContain("Iniciar como anfitrión");
  });

  it("muestra 'Iniciar como anfitrión' con hostUrl", () => {
    const html = render("https://zoom.us/s/1?zak=x");
    expect(html).toContain("Iniciar como anfitrión");
    expect(html).toContain("Unirse");
  });

  it("no ofrece unirse sin joinUrl", () => {
    const html = renderToStaticMarkup(createElement(ReunionZoomEncuentros, {
      solicitudIds: ["s1"],
      esAdmin: false,
      encuentros: [{ ...encuentro(null), joinUrl: null, estadoEnlace: "PENDIENTE" as const }]
    }));
    expect(html).not.toContain("Unirse");
    expect(html).toContain("Enlace pendiente");
  });
});

describe("enviarAccionEncuentro", () => {
  it("devuelve el error de la API ante un PATCH fallido", async () => {
    const fetchFalso = vi.fn(async () => new Response(JSON.stringify({ error: "No se puede reprogramar un encuentro que ya comenzó." }), { status: 409 }));
    const resultado = await enviarAccionEncuentro(fetchFalso as unknown as typeof fetch, "/api/x", { method: "PATCH", body: {} });
    expect(resultado).toEqual({ ok: false, mensaje: "No se puede reprogramar un encuentro que ya comenzó." });
  });

  it("informa la advertencia cuando la API acepta con sincronización pendiente", async () => {
    const fetchFalso = vi.fn(async () => new Response(JSON.stringify({ message: "Encuentro actualizado.", warning: "Pendiente." }), { status: 202 }));
    const resultado = await enviarAccionEncuentro(fetchFalso as unknown as typeof fetch, "/api/x", { method: "PATCH", body: {} });
    expect(resultado).toEqual({ ok: true, mensaje: "Pendiente." });
  });

  it("usa un mensaje genérico si la respuesta no es JSON", async () => {
    const fetchFalso = vi.fn(async () => new Response("boom", { status: 500 }));
    const resultado = await enviarAccionEncuentro(fetchFalso as unknown as typeof fetch, "/api/x", { method: "DELETE" });
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toBe("No se pudo completar la acción.");
  });
});

describe("detalle de reunión Zoom", () => {
  it("la ruta apunta al detalle Zoom", () => {
    expect(leer("app/(gestion)/reuniones/[solicitudId]/page.tsx")).toContain("reunion-zoom-detail-page.server");
  });

  it("la página no menciona Google, Meet, cohosts ni archivos de asistencia", () => {
    const pagina = leer("src/bootstrap/ui/reuniones/reunion-zoom-detail-page.server.tsx");
    expect(pagina).not.toMatch(/google|\bmeet\b|cohost|LISTA_ASISTENCIA/i);
  });

  it("solo entrega hostUrl a quien puede verlo", () => {
    const pagina = leer("src/bootstrap/ui/reuniones/reunion-zoom-detail-page.server.tsx");
    expect(pagina).toContain("puedeVerEnlaceAnfitrion");
  });
});
