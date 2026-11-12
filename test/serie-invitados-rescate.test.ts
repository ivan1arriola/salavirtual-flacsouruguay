import { describe, expect, it } from "vitest";
import {
  conciliarInvitadosCalendar,
  invitadosSchema
} from "../src/modules/reuniones/invitados-serie.service";
import { descripcionConAccesoMeet } from "../src/modules/reuniones/recuperacion-enlace-serie.service";
import { construirCorreoParticipacion } from "../src/modules/reuniones/avisos-participacion.domain";
import { readFileSync } from "node:fs";

describe("invitados de reunión y rescate de enlace de serie", () => {
  it("añade asistentes sin eliminar cohosts ni invitados manuales de Calendar", () => {
    const current = [
      { email: "cohost@flacso.edu.uy", responseStatus: "accepted" },
      { email: "externo@gmail.com", responseStatus: "needsAction" },
      { email: "antiguo@gmail.com", responseStatus: "accepted" }
    ];
    const updated = conciliarInvitadosCalendar(current, ["antiguo@gmail.com"], ["nuevo@gmail.com"]);
    expect(updated.map((x) => x.email)).toEqual([
      "cohost@flacso.edu.uy",
      "externo@gmail.com",
      "nuevo@gmail.com"
    ]);
    expect(updated[0]).toEqual(current[0]);
    expect(updated[1]).toEqual(current[1]);
    expect(updated[2]).toEqual({ email: "nuevo@gmail.com", optional: false });
  });

  it("normaliza emails y limita el número de invitados", () => {
    expect(invitadosSchema.parse({ emails: ["EXAMPLE@DOMAIN.COM"] }).emails).toEqual(["example@domain.com"]);
    expect(invitadosSchema.safeParse({ emails: ["wrong"] }).success).toBe(false);
    expect(
      invitadosSchema.safeParse({ emails: Array.from({ length: 101 }, (_, i) => `a${i}@example.com`) })
        .success
    ).toBe(false);
  });

  it("reemplaza la referencia antigua sin duplicar la nueva en la descripción", () => {
    const next = descripcionConAccesoMeet(
      "Seminario\nAcceso Google Meet: https://meet.google.com/old-oldx-xxx",
      "https://meet.google.com/new-abcd-xyz"
    );
    expect(next).toContain("Seminario");
    expect(next).not.toContain("old-oldx");
    expect(next.match(/Acceso Google Meet:/g)).toHaveLength(1);
  });

  it("envía avisos personalizados para invitados o coanfitriones con fechas futuras", () => {
    const meetings = [
      {
        id: "i-1",
        titulo: "Clase de Género",
        inicio: new Date("2026-10-24T13:00:00.000Z"),
        fin: new Date("2026-10-24T15:00:00.000Z"),
        urlMeet: "https://meet.google.com/abc-defg-hij"
      }
    ];
    const guests = construirCorreoParticipacion("INVITACION", meetings, "INVITADO");
    const cohosts = construirCorreoParticipacion("ENLACE_CAMBIADO", meetings, "COHOST");
    expect(guests.html).toContain("no te concede permisos de coanfitrión");
    expect(cohosts.html).toContain("coanfitrión");
    expect(cohosts.html).toContain("https://meet.google.com/abc-defg-hij");
    expect(cohosts.text).toContain("2026");
  });

  it("la interfaz mantiene gestión independiente y protección del ancho móvil", () => {
    const ui = readFileSync("src/modules/reuniones/presentation/components/series-management.tsx", "utf8");
    const css = readFileSync("app/(gestion)/meeting-detail-v2.css", "utf8");
    expect(ui).toContain("Invitados a la serie");
    expect(ui).toContain("/enlace-recuperacion");
    expect(ui).toContain("Confirmar nuevo enlace y avisar");
    expect(ui).toContain("/invitados");
    expect(css).toContain(".series-invited-manager");
    expect(css).toContain("overflow-wrap: anywhere");
  });
});
