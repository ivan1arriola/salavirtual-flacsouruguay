import { describe, expect, it } from "vitest";
import { construirCorreoNotificacion } from "../src/modules/notificaciones/notificacion-email.domain";

describe("correo de notificaciones", () => {
  it("incluye resumen, detalles y enlace absoluto al sistema", () => {
    const email = construirCorreoNotificacion({
      tipo: "REUNION_CREADA",
      titulo: "Reunión creada",
      cuerpo: "La clase quedó registrada.",
      href: "/reuniones/abc",
      emailSubject: "Confirmación de reunión",
      emailText: "Miércoles 12 de agosto, 18:30."
    }, "https://salas-meet.flacso.edu.uy");

    expect(email.subject).toBe("Confirmación de reunión");
    expect(email.text).toContain("https://salas-meet.flacso.edu.uy/reuniones/abc");
    expect(email.html).toContain("Abrir en el Gestor Meet");
    expect(email.html).toContain("Administrar preferencias de notificación");
  });

  it("escapa contenido dinámico en el correo HTML", () => {
    const email = construirCorreoNotificacion({
      tipo: "ASISTENCIA_REQUERIDA",
      titulo: "Clase <script>",
      cuerpo: "Docente & programa"
    }, "https://salas-meet.flacso.edu.uy/");

    expect(email.html).toContain("Clase &lt;script&gt;");
    expect(email.html).toContain("Docente &amp; programa");
    expect(email.html).not.toContain("<script>");
  });
});
