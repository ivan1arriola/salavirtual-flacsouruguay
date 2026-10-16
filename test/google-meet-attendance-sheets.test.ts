import { describe, expect, it, vi } from "vitest";
import { crearPlanillaAsistenciaGoogle, type MeetSheetInput } from "../src/modules/archivos/infrastructure/google/google-meet-attendance-sheets.client";
const input: MeetSheetInput = {
  titulo: "Encuentro", folderId: "folder", organizador: "host@example.com", cohosts: ["co@example.com"],
  inicio: new Date("2026-05-01T10:00:00Z"), fin: new Date("2026-05-01T11:00:00Z"), sesionesMeet: [],
  eventosAuditoria: [{ conferenceId: "raw-conf", endpointId: "raw-endpoint", meetingCode: "raw-code", identifier: "anon-123", identifierType: "device", displayName: "Anonymous", timestamp: "2026-05-01T10:10:00Z", durationSeconds: 600, parameters: [{ name: "identifier_type", value: "device" }] }],
  correosAuditados: [{ correo: "student@example.com", conferenciaId: "conf", externo: false, conexiones: [{ inicio: "2026-05-01T10:00:00Z", fin: "2026-05-01T10:50:00Z", duracionSegundos: 3000, nombre: "Student", identificador: "student@example.com" }] }]
};
describe("Sheets de asistencia", () => {
  it("crea tres pestañas, formato porcentual, mapa de calor e identificadores brutos", async () => {
    const request = vi.fn().mockResolvedValueOnce({ data: { spreadsheetId: "sheet" } }).mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ data: { parents: ["old"] } }).mockResolvedValueOnce({ data: { id: "sheet", name: "Encuentro" } });
    await crearPlanillaAsistenciaGoogle({ request } as never, input);
    const createPayload = request.mock.calls[0]![0].data;
    expect(createPayload.sheets.map((s: { properties: { title: string } }) => s.properties.title)).toEqual(["Asistencia", "Host y cohosts", "Datos brutos"]);
    const body = request.mock.calls[1]![0].data;
    expect(JSON.stringify(body)).toContain("addConditionalFormatRule");
    expect(JSON.stringify(body)).toContain("PERCENT");
    expect(JSON.stringify(body)).toContain("raw-endpoint");
    expect(JSON.stringify(body)).toContain("anon-123");
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
    const request = vi.fn().mockResolvedValueOnce({ data: { spreadsheetId: "sheet" } }).mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ data: { parents: [] } }).mockResolvedValueOnce({ data: { id: "sheet", name: "Encuentro" } });
    await crearPlanillaAsistenciaGoogle({ request } as never, malicious);
    const calls = JSON.stringify(request.mock.calls);
    expect(calls).toContain("'=HYPERLINK");
    expect(calls).toContain("COHOST CONFIGURADO");
    expect(calls).toContain("Sin registro de conexión");
    expect(request.mock.calls[3]![0].url).toContain("addParents=folder");
  });
