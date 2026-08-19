import { describe, expect, it } from "vitest";
import { construirCorreoNotificacion } from "../src/modules/notificaciones/notificacion-email.domain";
import { reunionEmailText } from "../src/modules/notificaciones/notificaciones.service";

describe("correo de notificaciones", () => {
  it("incluye resumen, detalles, acción y enlace absoluto al sistema", () => {
    const email = construirCorreoNotificacion({
      tipo: "REUNION_CREADA",
      titulo: "Reunión creada",
      cuerpo: "La clase quedó registrada.",
      href: "/reuniones/abc",
      emailSubject: "Confirmación de reunión",
      emailText: "Miércoles 12 de agosto, 18:30.",
      emailActionLabel: "Ver reunión"
    }, "https://salas-meet.flacso.edu.uy");

    expect(email.subject).toBe("Confirmación de reunión");
    expect(email.text).toContain("Ver reunión: https://salas-meet.flacso.edu.uy/reuniones/abc");
    expect(email.html).toContain("Ver reunión");
    expect(email.html).toContain("Información de la reunión");
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

  it("incluye la contraseña configurada de la sala en los detalles de la reunión", () => {
    const detalle = reunionEmailText({
      titulo: "Prueba",
      programa: "Programa de prueba",
      docente: "Docente",
      modalidad: "VIRTUAL",
      requiereAsistenciaTecnica: false,
      requiereGrabacion: false,
      instancias: [{
        inicio: "Martes, 18 de agosto, 18:15",
        fin: "21:15",
        sala: "host-principal@flacso.edu.uy",
        password: "Clave-actualizada-2026+",
        meet: "ids-zrev-eas",
        joinUrl: "https://meet.google.com/ids-zrev-eas"
      }]
    });

    expect(detalle).toContain("Usuario: host-principal@flacso.edu.uy");
    expect(detalle).toContain("Contraseña: Clave-actualizada-2026+");
    expect(detalle).toContain("Martes, 18 de agosto, 18:15 – 21:15");
    expect(detalle).toContain("Código de Meet: ids-zrev-eas");
  });

  it("no inventa una contraseña cuando la cuenta no tiene una configurada", () => {
    const detalle = reunionEmailText({
      titulo: "Prueba",
      instancias: [{
        inicio: "Martes, 18 de agosto, 18:15",
        fin: "21:15",
        sala: "host-secundario@flacso.edu.uy"
      }]
    });

    expect(detalle).toContain("Usuario: host-secundario@flacso.edu.uy");
    expect(detalle).not.toContain("Contraseña:");
  });
});
