import { describe, expect, it } from "vitest";
import {
  seleccionarRegistrosBrutos,
  serializarExportacionCsv,
  serializarExportacionJson
} from "../src/modules/archivos/domain/attendance-raw-export.domain";

const brutos = [
  [
    "Fuente",
    "Participante",
    "Correo",
    "Identificador",
    "Tipo",
    "Inicio (UTC)",
    "Fin (UTC)",
    "Duración (seg)",
    "Conferencia",
    "Endpoint",
    "Código Meet original",
    "Tipo identificador",
    "Timestamp auditoría",
    "Parámetros originales"
  ],
  [
    "MEET",
    "María, González",
    "",
    "participants/p1",
    "CUENTA_GOOGLE",
    "2026-10-21T12:00:00Z",
    "2026-10-21T12:20:00Z",
    1200,
    "conf/1",
    "session-1",
    "",
    "CUENTA_GOOGLE",
    "2026-10-21T12:00:00Z",
    ""
  ],
  [
    "REPORTS",
    '=HYPERLINK("http://test","test")',
    "a@example.com",
    "a@example.com",
    "email_address",
    "2026-10-21T12:00:00Z",
    "2026-10-21T12:30:00Z",
    1800,
    "conf-audit",
    "endpoint-1",
    "aaa-bbb-ccc",
    "email_address",
    "2026-10-21T12:30:00Z",
    '{"param":"valor"}'
  ],
  [
    "REPORTS_IDENTIDAD",
    "Ana",
    "a@example.com",
    "a@example.com",
    "email_address",
    "2026-10-21T12:00:00Z",
    "2026-10-21T12:30:00Z",
    1800,
    "conf-audit",
    "endpoint-1",
    "",
    "email_address",
    "2026-10-21T12:30:00Z",
    ""
  ],
  [
    "MEET",
    "Invitado",
    "",
    "participants/p1",
    "ANONIMO",
    "2026-10-21T12:40:00Z",
    "2026-10-21T13:00:00Z",
    1200,
    "conf/1",
    "session-2",
    "",
    "ANONIMO",
    "2026-10-21T12:40:00Z",
    ""
  ]
];

describe("exportación de datos brutos por fuente", () => {
  it("Meet conserva todas las sesiones y columnas originales, sin Reports ni deduplicación", () => {
    const exportacion = seleccionarRegistrosBrutos(brutos, "meet");
    expect(exportacion.registros).toHaveLength(2);
    expect(exportacion.registros[0]?.[3]).toBe("participants/p1");
    expect(exportacion.registros[1]?.[9]).toBe("session-2");
    expect(exportacion.columnas).toHaveLength(14);
    expect(serializarExportacionCsv(exportacion)).toContain('"María, González"');
    expect(serializarExportacionCsv(exportacion)).not.toContain("REPORTS");
  });

  it("Reports preserva eventos y registros de identidad completos sin mezclarlos con Meet", () => {
    const exportacion = seleccionarRegistrosBrutos(brutos, "reports");
    expect(exportacion.registros).toHaveLength(2);
    expect(exportacion.registros.map((row) => row[0])).toEqual(["REPORTS", "REPORTS_IDENTIDAD"]);
    expect(exportacion.registros[0]?.[13]).toBe('{"param":"valor"}');
    expect(exportacion.registros[1]?.[9]).toBe("endpoint-1");
    const csv = serializarExportacionCsv(exportacion);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("\r\n");
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('""http://test""');
    expect(csv).not.toContain("participants/p1");
  });

  it("JSON conserva valores numéricos y todos los campos por sesión", () => {
    const exportacion = seleccionarRegistrosBrutos(brutos, "reports");
    const texto = serializarExportacionJson(exportacion, {
      instanciaId: "inst-2",
      codigoMeet: "aaa-bbb-ccc",
      inicioProgramadoAt: "2026-10-21T12:00:00.000Z",
      finProgramadoAt: "2026-10-21T13:00:00.000Z",
      exportadoAt: "2026-10-21T14:00:00.000Z"
    });
    const json = JSON.parse(texto);
    expect(json.origenDatos).toBe("ultima_planilla_sincronizada");
    expect(json.registros).toHaveLength(2);
    expect(json.registros[0][7]).toBe(1800);
    expect(json.registros[0][13]).toBe('{"param":"valor"}');
    expect(json.instanciaId).toBe("inst-2");
  });

  it("un origen sin observaciones exporta solo encabezados, sin fabricar participantes", () => {
    const exportacion = seleccionarRegistrosBrutos([brutos[0]!], "meet");
    expect(exportacion.registros).toHaveLength(0);
    expect(serializarExportacionCsv(exportacion).split("\r\n")).toHaveLength(2);
  });
});
