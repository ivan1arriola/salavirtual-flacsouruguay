import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { enviarAccionEncuentro } from "../src/modules/reuniones/reunion-zoom-acciones";
import { ReunionZoomEncuentros } from "../src/modules/reuniones/presentation/components/reunion-zoom-encuentros";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const leer = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");

const encuentro = (puedeIniciar: boolean) => ({
  id: "i1",
  solicitudId: "s1",
  inicioIso: "2099-10-10T10:00:00-03:00",
  finIso: "2099-10-10T11:00:00-03:00",
  descripcion: null,
  estado: "PROGRAMADA",
  editable: true,
  puedeCancelar: true,
  puedeUnirse: true,
  joinUrl: "https://zoom.us/j/1",
  puedeIniciar,
  estadoEnlace: "LISTO" as const,
  eventoProveedorId: "ev1",
  operacion: "PROVISIONAR" as const
});

function render(puedeIniciar: boolean, esAdmin = false, extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(ReunionZoomEncuentros, {
      solicitudIds: ["s1"],
      esAdmin,
      puedeModificar: true,
      permiteCancelarSerie: true,
      encuentros: [{ ...encuentro(puedeIniciar), ...extra } as ReturnType<typeof encuentro>]
    })
  );
}

describe("encuentros de una reunión Zoom", () => {
  it("no muestra 'Iniciar como anfitrión' si el actor no puede iniciar", () => {
    expect(render(false)).not.toContain("Iniciar como anfitrión");
  });

  it("muestra 'Iniciar como anfitrión' apuntando a la ruta del servidor y nunca a un start_url", () => {
    const html = render(true);
    expect(html).toContain("Iniciar como anfitrión");
    expect(html).toContain("/api/v1/reuniones/instancias/i1/iniciar-zoom");
    expect(html).not.toContain("zak=");
    expect(html).toContain("Unirse");
  });

  it("oculta 'Cancelar encuentro' cuando es el único activo, pero deja editarlo y cancelar la serie", () => {
    const html = render(false, false, { puedeCancelar: false });
    expect(html).not.toContain("Cancelar encuentro");
    expect(html).toContain("Cambiar fecha y horario");
    expect(html).toContain("Cancelar toda la serie");
  });

  it("quien no es titular ni administración ve los encuentros pero no puede modificarlos", () => {
    const html = renderToStaticMarkup(
      createElement(ReunionZoomEncuentros, {
        solicitudIds: ["s1"],
        esAdmin: false,
        puedeModificar: false,
        permiteCancelarSerie: true,
        encuentros: [encuentro(false)]
      })
    );
    expect(html).toContain("Unirse");
    expect(html).not.toContain("Cambiar fecha y horario");
    expect(html).not.toContain("Cancelar encuentro");
    expect(html).not.toContain("Cancelar toda la serie");
  });

  it("en una serie partida entre Meet y Zoom no ofrece cancelar toda la serie", () => {
    const html = renderToStaticMarkup(
      createElement(ReunionZoomEncuentros, {
        solicitudIds: ["s1"],
        esAdmin: true,
        puedeModificar: true,
        permiteCancelarSerie: false,
        encuentros: [encuentro(false)]
      })
    );
    expect(html).not.toContain("Cancelar toda la serie");
    expect(html).toContain("Cambiar fecha y horario");
  });

  it("la página decide puedeModificar con la regla del titular", () => {
    const pagina = leer("src/bootstrap/ui/reuniones/reunion-zoom-detail-page.server.tsx");
    expect(pagina).toContain("puedeGestionarEncuentros");
  });

  it("ofrece 'Cancelar encuentro' cuando hay más de un encuentro activo", () => {
    expect(render(false, false, { puedeCancelar: true })).toContain("Cancelar encuentro");
  });

  it("sigue ofreciendo unirse e iniciar con el encuentro ya empezado", () => {
    const html = render(true, false, { editable: false, puedeUnirse: true });
    expect(html).toContain("Unirse");
    expect(html).toContain("Iniciar como anfitrión");
    expect(html).not.toContain("Cambiar fecha y horario");
  });

  it("no ofrece unirse, iniciar ni estado de enlace en un encuentro cancelado", () => {
    const html = render(true, true, {
      estado: "CANCELADA",
      editable: false,
      puedeUnirse: false,
      estadoEnlace: "PENDIENTE"
    });
    expect(html).not.toContain("Unirse");
    expect(html).not.toContain("Iniciar como anfitrión");
    expect(html).not.toContain("Reintentar");
    expect(html).not.toContain("Enlace pendiente");
  });

  it("'Reintentar' aparece para administración y no para otros cuando el enlace falló", () => {
    const fallado = { estadoEnlace: "ERROR", joinUrl: null };
    expect(render(false, true, fallado)).toContain("Reintentar");
    expect(render(false, false, fallado)).not.toContain("Reintentar");
  });

  it("un cambio sin sincronizar conserva 'Unirse' y ofrece 'Reintentar' a administración", () => {
    const html = render(false, true, { estadoEnlace: "ATENCION" });
    expect(html).toContain("Unirse");
    expect(html).toContain("Reintentar");
  });

  it("no ofrece unirse sin joinUrl", () => {
    const html = render(false, false, { joinUrl: null, estadoEnlace: "PENDIENTE" });
    expect(html).not.toContain("Unirse");
    expect(html).toContain("Enlace pendiente");
  });
});

describe("enviarAccionEncuentro", () => {
  it("devuelve el error de la API ante un PATCH fallido", async () => {
    const fetchFalso = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "No se puede reprogramar un encuentro que ya comenzó." }), {
          status: 409
        })
    );
    const resultado = await enviarAccionEncuentro(fetchFalso as unknown as typeof fetch, "/api/x", {
      method: "PATCH",
      body: {}
    });
    expect(resultado).toEqual({ ok: false, mensaje: "No se puede reprogramar un encuentro que ya comenzó." });
  });

  it("informa la advertencia cuando la API acepta con sincronización pendiente", async () => {
    const fetchFalso = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: "Encuentro actualizado.", warning: "Pendiente." }), {
          status: 202
        })
    );
    const resultado = await enviarAccionEncuentro(fetchFalso as unknown as typeof fetch, "/api/x", {
      method: "PATCH",
      body: {}
    });
    expect(resultado).toEqual({ ok: true, mensaje: "Pendiente." });
  });

  it("usa un mensaje genérico si la respuesta no es JSON", async () => {
    const fetchFalso = vi.fn(async () => new Response("boom", { status: 500 }));
    const resultado = await enviarAccionEncuentro(fetchFalso as unknown as typeof fetch, "/api/x", {
      method: "DELETE"
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toBe("No se pudo completar la acción.");
  });
});

describe("detalle de reunión Zoom", () => {
  it("la ruta pasa por el despachador, que puede abrir el detalle Zoom", () => {
    expect(leer("app/(gestion)/reuniones/[solicitudId]/page.tsx")).toContain("reunion-detalle-page.server");
    expect(leer("src/bootstrap/ui/reuniones/reunion-detalle-page.server.tsx")).toContain(
      "reunion-zoom-detail-page.server"
    );
  });

  it("la página no menciona Google, Meet, cohosts ni archivos de asistencia", () => {
    const pagina = leer("src/bootstrap/ui/reuniones/reunion-zoom-detail-page.server.tsx");
    expect(pagina).not.toMatch(/google|\bmeet\b|cohost|LISTA_ASISTENCIA/i);
  });

  it("calcula cuántos encuentros activos tiene cada solicitud para ofrecer cancelar", () => {
    const pagina = leer("src/bootstrap/ui/reuniones/reunion-zoom-detail-page.server.tsx");
    expect(pagina).toContain("puedeCancelar");
  });

  it("no selecciona ni serializa hostUrl hacia el navegador", () => {
    const pagina = leer("src/bootstrap/ui/reuniones/reunion-zoom-detail-page.server.tsx");
    expect(pagina).not.toContain("hostUrl");
    expect(pagina).toContain("puedeVerEnlaceAnfitrion");
  });
});
