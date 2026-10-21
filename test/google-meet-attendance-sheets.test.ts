import { describe, expect, it, vi } from "vitest";
import { buscarPlanillaAsistenciaDrive, crearPlanillaAsistenciaGoogle, planillaAsistenciaGoogleVacia, type MeetSheetInput } from "../src/modules/archivos/infrastructure/google/google-meet-attendance-sheets.client";
const input: MeetSheetInput = {
  titulo: "Encuentro", folderId: "folder", operationMarker: "stable-operation-marker", organizador: "host@example.com", cohosts: ["co@example.com"],
  inicio: new Date("2026-05-01T10:00:00Z"), fin: new Date("2026-05-01T11:00:00Z"), sesionesMeet: [{
    nombre: "Meet attendee", tipo: "ANONIMO", inicio: "2026-05-01T10:00:00Z", fin: "2026-05-01T10:10:00Z",
    conferencia: "conferenceRecords/meet-1", participanteId: "conferenceRecords/meet-1/participants/p1",
    sesionId: "conferenceRecords/meet-1/participants/p1/participantSessions/s1"
  }],
  eventosAuditoria: [{ conferenceId: "raw-conf", endpointId: "raw-endpoint", meetingCode: "raw-code", identifier: "anon-123", identifierType: "device", displayName: "Anonymous", timestamp: "2026-05-01T10:10:00Z", durationSeconds: 600, parameters: [{ name: "identifier_type", value: "device" }] }],
  correosAuditados: [{ correo: "student@example.com", conferenciaId: "conf", externo: false, conexiones: [{ inicio: "2026-05-01T10:00:00Z", fin: "2026-05-01T10:50:00Z", duracionSegundos: 3000, nombre: "Student", identificador: "student@example.com" }] }]
};
describe("Sheets de asistencia", () => {
  it("detecta una planilla vacía aunque tenga encabezados y host configurado", async () => {
    const request = vi.fn().mockResolvedValue({ data: {
      valueRanges: [
        { range: "Asistencia!A2:Z", values: [] },
        { range: "Datos brutos!A2:N", values: [] }
      ]
    } });
    await expect(planillaAsistenciaGoogleVacia({ request } as never, "sheet-empty")).resolves.toBe(true);
    const url: string = request.mock.calls[0]![0].url;
    expect(url).toContain("/spreadsheets/sheet-empty/values:batchGet");
    expect(decodeURIComponent(url)).toContain("A2");
    expect(url).not.toContain("Host+y+cohosts");
  });

  it("no considera vacía una planilla con registros reales en Asistencia", async () => {
    const request = vi.fn().mockResolvedValue({ data: {
      valueRanges: [
        { range: "Asistencia!A2:Z", values: [["Estudiante", "student@example.com"]] },
        { range: "Datos brutos!A2:N", values: [] }
      ]
    } });
    await expect(planillaAsistenciaGoogleVacia({ request } as never, "sheet-filled")).resolves.toBe(false);
  });

  it("conserva planillas con sesiones en Datos brutos, incluso sin correos", async () => {
    const request = vi.fn().mockResolvedValue({ data: {
      valueRanges: [
        { range: "Asistencia!A2:Z", values: [] },
        { range: "Datos brutos!A2:N", values: [["MEET", "Participante"]] }
      ]
    } });
    await expect(planillaAsistenciaGoogleVacia({ request } as never, "sheet-raw")).resolves.toBe(false);
  });

  it("crea tres pestañas, formato porcentual e identificadores brutos sin bloquear la escritura", async () => {
    const request = vi.fn().mockResolvedValueOnce({ data: { spreadsheetId: "sheet" } }).mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ data: { parents: ["old"] } }).mockResolvedValueOnce({ data: { id: "sheet", name: "Encuentro" } });
    await crearPlanillaAsistenciaGoogle({ request } as never, input);
    const createPayload = request.mock.calls[0]![0].data;
    expect(createPayload.sheets.map((s: { properties: { title: string } }) => s.properties.title)).toEqual(["Asistencia", "Host y cohosts", "Datos brutos"]);
    const markerPatch = request.mock.calls[1]![0];
    expect(markerPatch.data.appProperties.meetAttendanceOperation).toBe("stable-operation-marker");
    const body = request.mock.calls[2]![0].data;
    expect(JSON.stringify(body)).not.toContain("addConditionalFormatRule");
    expect(JSON.stringify(body)).toContain("PERCENT");
    expect(JSON.stringify(body)).toContain("raw-endpoint");
    expect(JSON.stringify(body)).toContain("anon-123");
    expect(JSON.stringify(body)).toContain("participantSessions/s1");
    expect(JSON.stringify(body)).toContain("conferenceRecords/meet-1");
  });
  it("actualiza el ID existente y limpia celdas antiguas", async () => {
    const request = vi.fn().mockResolvedValue({ data: { parents: ["folder"], id: "same", name: "Encuentro" } });
    await crearPlanillaAsistenciaGoogle({ request } as never, input, "same");
    expect(request.mock.calls.some(([call]) => call.url.includes("/same:batchUpdate"))).toBe(true);
    expect(request.mock.calls.some(([call]) => call.data?.requests?.some((r: { repeatCell?: unknown }) => r.repeatCell))).toBe(true);
  });
});
  it("separa host y cohost configurados y escapa texto de fórmulas", async () => {
    const malicious: MeetSheetInput = {
      ...input,
      correosAuditados: [{ correo: "student@example.com", conferenciaId: "conf", externo: false,
        nombre: '=HYPERLINK("https://attacker.test","click")',
        conexiones: [{ inicio: "2026-05-01T10:00:00Z", fin: "2026-05-01T10:50:00Z", duracionSegundos: 3000, nombre: "Student", identificador: "student@example.com" }] }]
    };
    const request = vi.fn().mockResolvedValueOnce({ data: { spreadsheetId: "sheet" } }).mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ data: { parents: [] } }).mockResolvedValueOnce({ data: { id: "sheet", name: "Encuentro" } });
    await crearPlanillaAsistenciaGoogle({ request } as never, malicious);
    const calls = JSON.stringify(request.mock.calls);
    expect(calls).toContain("'=HYPERLINK");
    expect(calls).toContain("COHOST CONFIGURADO");
    expect(calls).toContain("Sin registro de conexión");
    expect(request.mock.calls[4]![0].url).toContain("addParents=folder");
  });

it("recupera planillas solo mediante la marca de operación privada de Drive", async () => {
  const request = vi.fn().mockResolvedValue({ data: { files: [{ id: "sheet", name: "editable title" }] } });
  const result = await buscarPlanillaAsistenciaDrive({ request } as never, "stable-marker");
  expect(result?.id).toBe("sheet");
  expect(request.mock.calls[0]![0].url).toContain("appProperties");
  expect(request.mock.calls[0]![0].url).toContain("stable-marker");
  expect(request.mock.calls[0]![0].url).not.toContain("name%20%3D");
});

it("puebla pestaña Asistencia desde sesionesMeet cuando correosAuditados está vacío y alinea 14 columnas en datos brutos", async () => {
  const inputSinAuditoria: MeetSheetInput = {
    ...input,
    correosAuditados: [],
    eventosAuditoria: [],
    sesionesMeet: [
      {
        nombre: "Alumno Directo",
        tipo: "CUENTA_GOOGLE",
        inicio: "2026-05-01T10:05:00Z",
        fin: "2026-05-01T10:55:00Z",
        conferencia: "conferenceRecords/meet-1",
        participanteId: "participants/p1",
        sesionId: "participantSessions/s1"
      }
    ]
  };
  const request = vi.fn()
    .mockResolvedValueOnce({ data: { spreadsheetId: "sheet-fallback" } })
    .mockResolvedValueOnce({ data: {} })
    .mockResolvedValueOnce({ data: {} })
    .mockResolvedValueOnce({ data: { parents: [] } })
    .mockResolvedValueOnce({ data: { id: "sheet-fallback", name: "Encuentro" } });

  await crearPlanillaAsistenciaGoogle({ request } as never, inputSinAuditoria);
  const updateCalls = request.mock.calls[2]![0].data.requests;
  const updateCells = updateCalls.filter((r: any) => r.updateCells);
  // La pestaña 0 (Asistencia) tiene encabezado + fila de Alumno Directo
  const resumenRows = updateCells.find((r: any) => r.updateCells.start.sheetId === 0)?.updateCells.rows;
  expect(resumenRows).toHaveLength(2);
  expect(resumenRows[1].values[0].userEnteredValue.stringValue).toBe("Alumno Directo");
  expect(resumenRows[1].values[1].userEnteredValue.stringValue).toBe("No informado por auditoría");

  // La pestaña 2 (Datos brutos) tiene encabezado + fila MEET de 14 columnas
  const rawRows = updateCells.find((r: any) => r.updateCells.start.sheetId === 2)?.updateCells.rows;
  expect(rawRows[1].values).toHaveLength(14);
  expect(rawRows[1].values[0].userEnteredValue.stringValue).toBe("MEET");
  expect(rawRows[1].values[1].userEnteredValue.stringValue).toBe("Alumno Directo");
});

it("Meet sigue siendo la fuente principal de Asistencia aunque Reports tenga correos", async () => {
  const request = vi.fn()
    .mockResolvedValueOnce({ data: { spreadsheetId: "sheet-primary" } })
    .mockResolvedValueOnce({ data: {} })
    .mockResolvedValueOnce({ data: {} })
    .mockResolvedValueOnce({ data: { parents: [] } })
    .mockResolvedValueOnce({ data: { id: "sheet-primary", name: "Encuentro" } });
  await crearPlanillaAsistenciaGoogle({ request } as never, input);
  const updateCells = request.mock.calls[2]![0].data.requests.filter((r: any) => r.updateCells);
  const asistencia = updateCells.find((r: any) => r.updateCells.start.sheetId === 0)?.updateCells.rows;
  const brutos = updateCells.find((r: any) => r.updateCells.start.sheetId === 2)?.updateCells.rows;

  expect(asistencia).toHaveLength(2);
  expect(asistencia[1].values[0].userEnteredValue.stringValue).toBe("Meet attendee");
  expect(asistencia[1].values[1].userEnteredValue.stringValue).toBe("No informado por auditoría");
  expect(JSON.stringify(asistencia)).not.toContain("student@example.com");
  expect(JSON.stringify(brutos)).toContain("student@example.com");
  expect(JSON.stringify(brutos)).toContain("REPORTS_IDENTIDAD");
  expect(JSON.stringify(brutos)).toContain("raw-endpoint");
});
