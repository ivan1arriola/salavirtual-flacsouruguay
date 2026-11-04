import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MeetingCreationDialog } from "../src/modules/reuniones/presentation/components/meeting-creation-dialog";

const fuente = readFileSync(new URL("../src/modules/reuniones/presentation/components/meeting-creation-dialog.tsx", import.meta.url), "utf8");

describe("diálogo de creación de reunión", () => {
  it("es modal, está rotulado por su título y puede recibir el foco", () => {
    const html = renderToStaticMarkup(createElement(MeetingCreationDialog, { state: "saving", message: "", meetingCount: 3 }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="meeting-creation-title"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("Guardando 3 encuentros y configurando Zoom.");
  });

  it("mientras guarda no ofrece ningún control; al terminar ofrece ver la reunión o crear otra", () => {
    const guardando = renderToStaticMarkup(createElement(MeetingCreationDialog, { state: "saving", message: "", meetingCount: 1 }));
    expect(guardando).not.toContain("<a ");
    const hecho = renderToStaticMarkup(createElement(MeetingCreationDialog, { state: "done", message: "Listo.", meetingId: "s1", meetingCount: 1 }));
    expect(hecho).toContain('href="/reuniones/s1"');
    expect(hecho).toContain("Crear otra");
  });

  it("gestiona el foco: lo toma al abrirse y lo lleva al enlace principal al terminar", () => {
    expect(fuente).toContain("useEffect");
    expect(fuente).toMatch(/dialogoRef\.current\?\.focus\(\)/);
    expect(fuente).toMatch(/principalRef\.current\?\.focus\(\)/);
  });

  it("mantiene el foco dentro del diálogo con Tab y no se cierra con Escape", () => {
    expect(fuente).toContain('event.key !== "Tab"');
    expect(fuente).toContain("preventDefault()");
  });

  it("no menciona a Google", () => {
    expect(fuente).not.toMatch(/google/i);
  });
});
