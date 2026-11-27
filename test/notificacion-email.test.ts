import { describe, expect, it } from "vitest";
import { construirCorreoNotificacion } from "../src/modules/notificaciones/notificacion-email.domain";
import { reunionEmailText } from "../src/modules/notificaciones/notificaciones.service";

describe("correo de notificaciones", () => {
  it("incluye resumen, detalles, acción y enlace absoluto al sistema", () => {
    const email = construirCorreoNotificacion(
      {
        tipo: "REUNION_CREADA",
        titulo: "Reunión creada",
        cuerpo: "La clase quedó registrada.",
        href: "/reuniones/abc",
        emailSubject: "Confirmación de reunión",
        emailText: "Miércoles 12 de agosto, 18:30.",
        emailActionLabel: "Ver reunión",
      },
      "https://salas-meet.flacso.edu.uy",
    );

    expect(email.subject).toBe("Confirmación de reunión");
    expect(email.text).toContain("Ver reunión: https://salas-meet.flacso.edu.uy/reuniones/abc");
    expect(email.html).toContain("Ver reunión");
    expect(email.html).toContain("Información de la reunión");
    expect(email.html).toContain("Administrar preferencias de notificación");
  });

  it("escapa contenido dinámico en el correo HTML", () => {
    const email = construirCorreoNotificacion(
      {
        tipo: "ASISTENCIA_REQUERIDA",
        titulo: "Clase <script>",
        cuerpo: "Docente & programa",
      },
      "https://salas-meet.flacso.edu.uy/",
    );

    expect(email.html).toContain("Clase &lt;script&gt;");
    expect(email.html).toContain("Docente &amp; programa");
    expect(email.html).not.toContain("<script>");
  });

  it("incluye la contraseña configurada de la sala en los detalles de la reunión si se proporciona", () => {
    const detalle = reunionEmailText({
      titulo: "Prueba",
      programa: "Programa de prueba",
      docente: "Docente",
      modalidad: "VIRTUAL",
      requiereAsistenciaTecnica: false,
      requiereGrabacion: false,
      instancias: [
        {
          inicio: "Martes, 18 de agosto, 18:15",
          fin: "21:15",
          sala: "host-principal@flacso.edu.uy",
          password: "Clave-actualizada-2026+",
          meet: "ids-zrev-eas",
          joinUrl: "https://meet.google.com/ids-zrev-eas",
        },
      ],
    });

    expect(detalle).toContain("Sala: host-principal@flacso.edu.uy");
    expect(detalle).toContain("Contraseña: Clave-actualizada-2026+");
    expect(detalle).toContain("Martes, 18 de agosto, 18:15 – 21:15");
    expect(detalle).toContain("Código de Meet: ids-zrev-eas");
  });

  it("no inventa una contraseña cuando la cuenta no tiene una configurada", () => {
    const detalle = reunionEmailText({
      titulo: "Prueba",
      instancias: [
        {
          inicio: "Martes, 18 de agosto, 18:15",
          fin: "21:15",
          sala: "host-secundario@flacso.edu.uy",
        },
      ],
    });

    expect(detalle).toContain("Sala: host-secundario@flacso.edu.uy");
    expect(detalle).not.toContain("Contraseña:");
  });

  it("explica cómo acceder a la reunión cuando no requiere monitoreo", () => {
    const detalle = reunionEmailText({
      titulo: "Taller de Investigación",
      programa: "Doctorado",
      docente: "Dra. García",
      requiereAsistenciaTecnica: false,
      instancias: [
        {
          inicio: "Lunes, 15 de setiembre, 18:00",
          fin: "20:00",
          sala: "sala01@flacso.edu.uy",
          joinUrl: "https://meet.google.com/abc-defg-hij",
        },
      ],
    });

    expect(detalle).toContain("¿CÓMO ACCEDER A LA REUNIÓN?");
    expect(detalle).toContain(
      "No es necesario iniciar sesión con la cuenta de la sala ni usar su contraseña",
    );
    expect(detalle).toContain(
      "Google Meet les otorgará automáticamente permisos de co-anfitrión (co-host)",
    );
    expect(detalle).toContain(
      "Participantes y estudiantes: ingresan directamente a través del enlace de Google Meet",
    );
    expect(detalle).toContain("Monitoreo: no requerido");
  });

  it("explica cómo acceder cuando requiere monitoreo con y sin asistente asignado", () => {
    const pendiente = reunionEmailText({
      titulo: "Seminario Abierto",
      requiereAsistenciaTecnica: true,
      instancias: [
        {
          inicio: "Miércoles, 17 de setiembre, 19:00",
          fin: "21:00",
          joinUrl: "https://meet.google.com/xyz-uvwx-rst",
        },
      ],
    });
    expect(pendiente).toContain(
      "Monitoreo: la reunión requiere monitoreo (pendiente de asignación)",
    );

    const asignada = reunionEmailText({
      titulo: "Seminario Abierto",
      requiereAsistenciaTecnica: true,
      asistenteTecnico: "Juan Asistente",
      instancias: [
        {
          inicio: "Miércoles, 17 de setiembre, 19:00",
          fin: "21:00",
          joinUrl: "https://meet.google.com/xyz-uvwx-rst",
        },
      ],
    });
    expect(asignada).toContain("Monitoreo: asignado a Juan Asistente");
  });

  it("maqueta en el correo HTML una tarjeta destacada para las instrucciones de acceso y enlaces clicables", () => {
    const emailText = reunionEmailText({
      titulo: "Clase Magistral",
      instancias: [
        {
          inicio: "Jueves, 18 de setiembre, 18:00",
          fin: "20:00",
          joinUrl: "https://meet.google.com/aaa-bbbb-ccc",
        },
      ],
    });

    const email = construirCorreoNotificacion(
      {
        tipo: "REUNION_CREADA",
        titulo: "Reunión creada",
        cuerpo: "La reunión ha sido creada exitosamente.",
        emailText,
        href: "/reuniones/123",
      },
      "https://salas-meet.flacso.edu.uy",
    );

    expect(email.html).toContain("¿Cómo acceder?");
    expect(email.html).toContain("border-left:5px solid #167e9f");
    expect(email.html).toContain('href="https://meet.google.com/aaa-bbbb-ccc"');
  });
});
