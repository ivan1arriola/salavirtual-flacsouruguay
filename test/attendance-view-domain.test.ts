import { describe, expect, it } from "vitest";
import { construirVistaAsistencia } from "../src/modules/archivos/domain/attendance-view.domain";

const inicio = new Date("2026-10-21T14:00:00Z");
const fin = new Date("2026-10-21T15:00:00Z");

describe("vista de asistencia por encuentro", () => {
  it("usa Meet como fuente principal aun si Reports proporciona correos", () => {
    const datos = construirVistaAsistencia({
      asistencia: [
        ["Participante", "Correo", "Primera conexión (UY)", "Última desconexión (UY)", "Minutos conectados", "Asistencia (%)", "Umbral de 5/6", "Conexiones"],
        ["Ana Pérez", "ana@example.org", "11:00:00", "11:50:00", 50, 50 / 60, "CUMPLE", 1]
      ],
      responsables: [["Participante", "Correo", "Rol"], ["Organizador", "host@flacso.edu.uy", "HOST", "", "", 0, 0]],
      datosBrutos: [
        ["Fuente", "Participante", "Correo", "Identificador", "Tipo", "Inicio", "Fin"],
        ["REPORTS", "Ana Pérez", "ana@example.org", "ana@example.org", "email_address", "2026-10-21T14:00:00Z", "2026-10-21T14:50:00Z", 3000, "conf-a", "endpoint-a", "meet-code", "email_address", "2026-10-21T14:50:00Z"],
        ["MEET", "Ana Pérez", "", "participants/abc", "CUENTA_GOOGLE", "2026-10-21T14:00:00Z", "2026-10-21T14:25:00Z", 1500, "meet-conf", "s1"],
        ["MEET", "Ana Pérez", "", "participants/abc", "CUENTA_GOOGLE", "2026-10-21T14:20:00Z", "2026-10-21T14:50:00Z", 1800, "meet-conf", "s2"]
      ]
    }, inicio, fin);
    expect(datos.participantes).toMatchObject([{ correo: null, fuente: "MEET", minutos: 50, conexiones: 2, porcentaje: 83.33 }]);
    expect(datos.reportes).toMatchObject([{ correo: "ana@example.org", fuente: "REPORTS", conexiones: 1 }]);
    expect(datos.responsables).toMatchObject([{ rol: "HOST", correo: "host@flacso.edu.uy" }]);
    expect(datos.indicador).toMatchObject({
      personasMeet: 1, sesionesMeet: 2, correosReports: 1, sesionesReports: 1,
      personasVinculadas: 0, diferenciaSesiones: 1
    });
    expect(datos.registrosHeredados).toHaveLength(0);
  });

  it("no usa una planilla antigua de Reports para contar personas Meet", () => {
    const data = construirVistaAsistencia({
      asistencia: [["Participante"], ["Alguien", "alguien@example.com", "", "", 20, 0.3333, "MENOS DE 5/6", 1]],
      responsables: [], datosBrutos: []
    }, inicio, fin);
    expect(data.participantes).toHaveLength(0);
    expect(data.registrosHeredados[0]).toMatchObject({ correo: "alguien@example.com", fuente: "LEGADO", porcentaje: 33.33 });
    expect(data.indicador.estado).toBe("SIN_MEET");
  });

  it("reconoce sesiones Meet sin correo y conserva los registros anónimos Reports por separado", () => {
    const data = construirVistaAsistencia({
      asistencia: [], responsables: [],
      datosBrutos: [
        ["Fuente"],
        ["MEET", "Invitado", "", "participants/one", "", "2026-10-21T13:45:00Z", "2026-10-21T14:20:00Z", 2100, "conf-1", "s1"],
        ["MEET", "Invitado", "", "participants/one", "", "2026-10-21T14:20:00Z", "2026-10-21T14:45:00Z", 1500, "conf-1", "s2"],
        ["REPORTS", "Invitado", "", "device-1", "device", "2026-10-21T14:20:00Z", "2026-10-21T14:45:00Z", 1500, "report-conf", "e1", "meetcode", "device", "2026-10-21T14:45:00Z"]
      ]
    }, inicio, fin);
    expect(data.participantes).toHaveLength(1);
    expect(data.participantes[0]).toMatchObject({ minutos: 45, porcentaje: 75, conexiones: 2 });
    expect(data.indicador.registrosReportsSinCorreo).toBe(1);
    expect(data.reportes).toHaveLength(0);
  });
});
