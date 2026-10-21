import { describe, expect, it } from "vitest";
import { construirVistaAsistencia } from "../src/modules/archivos/domain/attendance-view.domain";

const inicio = new Date("2026-10-21T14:00:00Z");
const fin = new Date("2026-10-21T15:00:00Z");

describe("vista de asistencia por encuentro", () => {
  it("presenta identidad de Reports y conserva sesiones Meet sin atribuir por nombre", () => {
    const datos = construirVistaAsistencia({
      asistencia: [
        ["Participante", "Correo", "Primera conexión (UY)", "Última desconexión (UY)", "Minutos conectados", "Asistencia (%)", "Umbral de 5/6", "Conexiones"],
        ["Ana Pérez", "ana@example.org", "11:00:00", "11:50:00", 50, 50 / 60, "CUMPLE", 2]
      ],
      responsables: [["Participante", "Correo", "Rol"], ["Organizador", "host@flacso.edu.uy", "HOST", "", "", 0, 0]],
      datosBrutos: [
        ["Fuente", "Participante", "Correo", "Identificador", "Tipo", "Inicio", "Fin"],
        ["REPORTS", "Ana Pérez", "ana@example.org", "ana@example.org", "email_address", "2026-10-21T14:00:00Z", "2026-10-21T14:50:00Z"],
        ["MEET", "Ana Pérez", "", "participants/abc", "CUENTA_GOOGLE", "2026-10-21T14:00:00Z", "2026-10-21T14:25:00Z"],
        ["MEET", "Ana Pérez", "", "participants/abc", "CUENTA_GOOGLE", "2026-10-21T14:20:00Z", "2026-10-21T14:50:00Z"]
      ]
    }, inicio, fin);
    expect(datos.participantes).toMatchObject([{ correo: "ana@example.org", fuente: "REPORTS", porcentaje: 83.33 }]);
    expect(datos.responsables).toMatchObject([{ rol: "HOST", correo: "host@flacso.edu.uy" }]);
    expect(datos.registrosMeet).toHaveLength(1);
    expect(datos.registrosMeet[0]).toMatchObject({ correo: null, minutos: 50, conexiones: 2 });
    expect(datos.eventosMeet).toBe(2);
    expect(datos.eventosReports).toBe(1);
  });

  it("mantiene asistentes sin correo y no los confunde con ausentes", () => {
    const data = construirVistaAsistencia({
      asistencia: [["Participante"], ["Anónimo", "No informado por auditoría", "", "", 20, 0.3333, "MENOS DE 5/6", 1]],
      responsables: [],
      datosBrutos: []
    }, inicio, fin);
    expect(data.participantes[0]).toMatchObject({ correo: null, fuente: "MEET", cumple: false, porcentaje: 33.33 });
  });

  it("no duplica sesiones de un mismo participante Meet y recorta al horario previsto", () => {
    const data = construirVistaAsistencia({
      asistencia: [], responsables: [],
      datosBrutos: [
        ["Fuente"],
        ["MEET", "Invitado", "", "participants/one", "", "2026-10-21T13:45:00Z", "2026-10-21T14:20:00Z"],
        ["MEET", "Invitado", "", "participants/one", "", "2026-10-21T14:20:00Z", "2026-10-21T14:45:00Z"]
      ]
    }, inicio, fin);
    expect(data.registrosMeet).toHaveLength(1);
    expect(data.registrosMeet[0]).toMatchObject({ minutos: 45, porcentaje: 75, conexiones: 2 });
  });
});
