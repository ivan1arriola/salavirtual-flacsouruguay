import { describe, expect, it } from "vitest";
import { construirCorreoNotificacion } from "../src/modules/notificaciones/notificacion-email.domain";
import {
  contrasenaSalaFlacso,
  reunionEmailText
} from "../src/modules/notificaciones/notificaciones.service";

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

  it("deriva la contraseña de las cuentas de sala FLACSO", () => {
    expect(contrasenaSalaFlacso("sala01@flacso.edu.uy")).toBe("Sala01FLACSO+");
    expect(contrasenaSalaFlacso("sala08@flacso.edu.uy")).toBe("Sala08FLACSO+");
    expect(contrasenaSalaFlacso("docente@flacso.edu.uy")).toBeNull();
  });

  it("incluye usuario y contraseña de la sala en los detalles de la reunión", () => {
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
        sala: "sala03@flacso.edu.uy",
        meet: "ids-zrev-eas",
        joinUrl: "https://meet.google.com/ids-zrev-eas"
      }]
    });

    expect(detalle).toContain("Usuario: sala03@flacso.edu.uy");
    expect(detalle).toContain("Contraseña: Sala03FLACSO+");
    expect(detalle).toContain("Martes, 18 de agosto, 18:15 – 21:15");
    expect(detalle).toContain("Código de Meet: ids-zrev-eas");
  });
});
