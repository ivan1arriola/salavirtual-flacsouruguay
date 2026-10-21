import { describe, expect, it } from "vitest";
import { conciliarMeetReports, type EventoReportsConciliable } from "../src/modules/archivos/domain/meet-reports-reconciliation.domain";

const inicio = new Date("2026-10-21T14:00:00Z");
const fin = new Date("2026-10-21T15:00:00Z");

const reporte: EventoReportsConciliable = {
  nombre: "Ana", identificador: "ana@example.com", tipoIdentificador: "email_address",
  conferenciaId: "aud-1", endpointId: "device-1",
  inicio: "2026-10-21T14:00:00Z", fin: "2026-10-21T14:50:00Z", timestamp: "2026-10-21T14:50:00Z"
};

describe("conciliación segura Meet + Reports", () => {
  it("prioriza personas y sesiones Meet y no suma correos Reports como personas nuevas", () => {
    const result = conciliarMeetReports([
      { nombre: "Ana", participanteId: "p1", sesionId: "s1", inicio: "2026-10-21T14:00:00Z", fin: "2026-10-21T14:20:00Z" },
      { nombre: "Ana", participanteId: "p1", sesionId: "s2", inicio: "2026-10-21T14:18:00Z", fin: "2026-10-21T14:50:00Z" },
      { nombre: "Beto", participanteId: "p2", sesionId: "s3", inicio: "2026-10-21T14:10:00Z", fin: "2026-10-21T14:30:00Z" }
    ], [reporte], inicio, fin);

    expect(result.indicador).toMatchObject({
      personasMeet: 2, sesionesMeet: 3, correosReports: 1, sesionesReports: 1,
      personasVinculadas: 0, meetSinVincular: 2, correosSinVincular: 1,
      diferenciaPersonas: 1, diferenciaSesiones: 2, estado: "PARCIAL"
    });
    expect(result.meet[0]).toMatchObject({ nombre: "Ana", correo: null, sesiones: 2, conciliacion: "SIN_VINCULO", resumen: { minutosConectados: 50 } });
  });

  it("solo vincula por el correo verificado existente en Meet, nunca por nombre ni horario", () => {
    const result = conciliarMeetReports([
      { nombre: "Ana", participanteId: "p1", correoVerificado: "ANA@example.com", inicio: "2026-10-21T14:00:00Z", fin: "2026-10-21T14:35:00Z" },
      { nombre: "Ana", participanteId: "p2", inicio: "2026-10-21T14:00:00Z", fin: "2026-10-21T14:40:00Z" }
    ], [reporte], inicio, fin);
    expect(result.meet[0]).toMatchObject({
      correo: "ana@example.com", conciliacion: "VERIFICADA",
      diferenciaMinutos: -15, diferenciaSesiones: 0
    });
    expect(result.meet[1]).toMatchObject({ correo: null, conciliacion: "SIN_VINCULO" });
    expect(result.indicador.personasVinculadas).toBe(1);
  });

  it("no vincula ni atribuye identidades cuando hay varias conferencias Reports", () => {
    const result = conciliarMeetReports([
      { nombre: "Ana", participanteId: "p1", correoVerificado: "ana@example.com", inicio: "2026-10-21T14:00:00Z", fin: "2026-10-21T14:35:00Z" }
    ], [reporte, { ...reporte, conferenciaId: "otra-conferencia", endpointId: "device-2" }], inicio, fin);
    expect(result.indicador).toMatchObject({ estado: "CONFERENCIA_AMBIGUA", conferenciasReports: 2, correosReports: 1, personasVinculadas: 0 });
    expect(result.meet[0]?.conciliacion).toBe("SIN_VINCULO");
  });

  it("deduplica eventos repetidos y detecta tiempos Reports sin solapamiento con Meet", () => {
    const result = conciliarMeetReports([
      { nombre: "Beto", participanteId: "p1", sesionId: "s1", inicio: "2026-10-21T14:00:00Z", fin: "2026-10-21T14:10:00Z" },
      { nombre: "Beto", participanteId: "p1", sesionId: "s1", inicio: "2026-10-21T14:00:00Z", fin: "2026-10-21T14:10:00Z" }
    ], [{ ...reporte, inicio: "2026-10-21T14:30:00Z", fin: "2026-10-21T14:45:00Z" }, { ...reporte, inicio: "2026-10-21T14:30:00Z", fin: "2026-10-21T14:45:00Z" }], inicio, fin);
    expect(result.indicador).toMatchObject({
      personasMeet: 1, sesionesMeet: 1, sesionesReports: 1, sesionesReportsSinSolapamiento: 1
    });
  });

  it("distingue datos ausentes de ausencia de participantes", () => {
    expect(conciliarMeetReports([], [reporte], inicio, fin).indicador.estado).toBe("SIN_MEET");
    expect(conciliarMeetReports([{ nombre: "Ana", participanteId: "p1", inicio: "2026-10-21T14:00:00Z", fin: "2026-10-21T14:10:00Z" }], [], inicio, fin).indicador.estado).toBe("SIN_REPORTS");
  });
});
