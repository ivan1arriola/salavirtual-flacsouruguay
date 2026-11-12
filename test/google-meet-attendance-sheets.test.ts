import { describe, expect, it, vi } from "vitest";
import {
  buscarPlanillaAsistenciaDrive,
  crearPlanillaAsistenciaGoogle,
  planillaAsistenciaGoogleVacia,
  type MeetSheetInput
} from "../src/modules/archivos/infrastructure/google/google-meet-attendance-sheets.client";
const input: MeetSheetInput = {
  titulo: "Encuentro",
  folderId: "folder",
  operationMarker: "stable-operation-marker",
  organizador: "host@example.com",
  cohosts: ["co@example.com"],
  inicio: new Date("2026-05-01T10:00:00Z"),
  fin: new Date("2026-05-01T11:00:00Z"),
  sesionesMeet: [
    {
      nombre: "Meet attendee",
      tipo: "ANONIMO",
      inicio: "2026-05-01T10:00:00Z",
      fin: "2026-05-01T10:10:00Z",
      conferencia: "conferenceRecords/meet-1",
      participanteId: "conferenceRecords/meet-1/participants/p1",
      sesionId: "conferenceRecords/meet-1/participants/p1/participantSessions/s1"
    }
  ],
  eventosAuditoria: [
    {
      conferenceId: "raw-conf",
      endpointId: "raw-endpoint",
      meetingCode: "raw-code",
      identifier: "anon-123",
      identifierType: "device",
      displayName: "Anonymous",
      timestamp: "2026-05-01T10:10:00Z",
      durationSeconds: 600,
      parameters: [{ name: "identifier_type", value: "device" }]
    }
  ],
  correosAuditados: [
    {
      correo: "student@example.com",
      conferenciaId: "conf",
      externo: false,
      conexiones: [
        {
          inicio: "2026-05-01T10:00:00Z",
          fin: "2026-05-01T10:50:00Z",
          duracionSegundos: 3000,
          nombre: "Student",
          identificador: "student@example.com"
        }
      ]
    }
  ]
};
describe("Sheets de asistencia", () => {
  it("detecta una planilla vacía aunque tenga encabezados y host configurado", async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        valueRanges: [
          { range: "Asistencia!A2:Z", values: [] },
          { range: "Datos brutos!A2:N", values: [] }
        ]
      }
    });
    await expect(planillaAsistenciaGoogleVacia({ request } as never, "sheet-empty")).resolves.toBe(true);
    const url: string = request.mock.calls[0]![0].url;
    expect(url).toContain("/spreadsheets/sheet-empty/values:batchGet");
    expect(decodeURIComponent(url)).toContain("A2");
    expect(url).not.toContain("Host+y+cohosts");
  });

  it("no considera vacía una planilla con registros reales en Asistencia", async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        valueRanges: [
          { range: "Asistencia!A2:Z", values: [["Estudiante", "student@example.com"]] },
          { range: "Datos brutos!A2:N", values: [] }
        ]
      }
    });
    await expect(planillaAsistenciaGoogleVacia({ request } as never, "sheet-filled")).resolves.toBe(false);
  });

  it("conserva planillas con sesiones en Datos brutos, incluso sin correos", async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        valueRanges: [
          { range: "Asistencia!A2:Z", values: [] },
          { range: "Datos brutos!A2:N", values: [["MEET", "Participante"]] }
        ]
      }
    });
    await expect(planillaAsistenciaGoogleVacia({ request } as never, "sheet-raw")).resolves.toBe(false);
  });

  it("crea tres pestañas, formato porcentual e identificadores brutos sin bloquear la escritura", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ data: { spreadsheetId: "sheet" } })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: { parents: ["old"] } })
      .mockResolvedValueOnce({ data: { id: "sheet", name: "Encuentro" } });
    await crearPlanillaAsistenciaGoogle({ request } as never, input);
    const createPayload = request.mock.calls[0]![0].data;
    expect(createPayload.sheets.map((s: { properties: { title: string } }) => s.properties.title)).toEqual([
      "Asistencia",
      "Host y cohosts",
      "Datos brutos"
    ]);
    const markerPatch = request.mock.calls[1]![0];
    expect(markerPatch.data.appProperties.meetAttendanceOperation).toBe("stable-operation-marker");
    const body = request.mock.calls[2]![0].data;
    expect(JSON.stringify(body)).toContain("addConditionalFormatRule");
    expect(JSON.stringify(body)).toContain("=$F2>=5/6");
    const formulas = body.requests
      .filter(
        (request: {
          addConditionalFormatRule?: {
            rule: { booleanRule: { condition: { values: Array<{ userEnteredValue: string }> } } };
          };
        }) => request.addConditionalFormatRule
      )
      .map(
        (request: {
          addConditionalFormatRule: {
            rule: { booleanRule: { condition: { values: Array<{ userEnteredValue: string }> } } };
          };
        }) => request.addConditionalFormatRule.rule.booleanRule.condition.values[0]!.userEnteredValue
      );
    expect(formulas).toEqual(["=$F2>=5/6", "=($F2>=3/4)*($F2<5/6)>0", "=$F2<3/4"]);
    expect(JSON.stringify(body)).toContain("PERCENT");
    expect(JSON.stringify(body)).toContain("raw-endpoint");
    expect(JSON.stringify(body)).toContain("anon-123");
    expect(JSON.stringify(body)).toContain("participantSessions/s1");
    expect(JSON.stringify(body)).toContain("conferenceRecords/meet-1");
  });
  it("actualiza el ID existente y limpia celdas antiguas", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ data: { parents: ["folder"], id: "same", name: "Encuentro" } });
    await crearPlanillaAsistenciaGoogle({ request } as never, input, "same");
    expect(request.mock.calls.some(([call]) => call.url.includes("/same:batchUpdate"))).toBe(true);
    expect(
      request.mock.calls.some(([call]) =>
        call.data?.requests?.some((r: { repeatCell?: unknown }) => r.repeatCell)
      )
    ).toBe(true);
  });
  it("conserva una planilla ya escrita si Drive no permite moverla a la carpeta", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: { sheets: [] } })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: { parents: [] } })
      .mockRejectedValueOnce({ response: { status: 404 }, message: "File not found: folder" });
    await expect(crearPlanillaAsistenciaGoogle({ request } as never, input, "same")).resolves.toMatchObject({
      id: "same",
      mimeType: "application/vnd.google-apps.spreadsheet"
    });
    expect(
      request.mock.calls[3]![0].data.requests.some((item: { updateCells?: unknown }) => item.updateCells)
    ).toBe(true);
  });
});
it("separa host y cohost configurados y escapa texto de fórmulas", async () => {
  const malicious: MeetSheetInput = {
    ...input,
    correosAuditados: [
      {
        correo: "student@example.com",
        conferenciaId: "conf",
        externo: false,
        nombre: '=HYPERLINK("https://attacker.test","click")',
        conexiones: [
          {
            inicio: "2026-05-01T10:00:00Z",
            fin: "2026-05-01T10:50:00Z",
            duracionSegundos: 3000,
            nombre: "Student",
            identificador: "student@example.com"
          }
        ]
      }
    ]
  };
  const request = vi
    .fn()
    .mockResolvedValueOnce({ data: { spreadsheetId: "sheet" } })
    .mockResolvedValueOnce({ data: {} })
    .mockResolvedValueOnce({ data: {} })
    .mockResolvedValueOnce({ data: { parents: [] } })
    .mockResolvedValueOnce({ data: { id: "sheet", name: "Encuentro" } });
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
  const request = vi
    .fn()
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
  const request = vi
    .fn()
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

it("separa host y cohosts de la pestaña Asistencia usando el correo atribuido y agrega observaciones", async () => {
  const sesion = (nombre: string, id: string, correo: string | undefined, fin: string) => ({
    nombre,
    tipo: "CUENTA_GOOGLE" as const,
    inicio: "2026-05-01T10:00:00Z",
    fin,
    conferencia: "conferenceRecords/c",
    participanteId: id,
    sesionId: `${id}/s1`,
    ...(correo ? { correoVerificado: correo } : {})
  });
  const conRoles: MeetSheetInput = {
    ...input,
    correosAuditados: [],
    eventosAuditoria: [],
    sesionesMeet: [
      sesion("Sala 01", "pH", "host@example.com", "2026-05-01T11:00:00Z"),
      sesion("Apoyo", "pC", "co@example.com", "2026-05-01T11:00:00Z"),
      sesion("Alumna Cumple", "pA", "a@x.com", "2026-05-01T10:55:00Z"),
      sesion("Alumno Justo", "pB", "b@x.com", "2026-05-01T10:48:00Z"),
      sesion("Sin Correo", "pD", undefined, "2026-05-01T10:20:00Z")
    ]
  };
  const request = vi
    .fn()
    .mockResolvedValueOnce({ data: { spreadsheetId: "s" } })
    .mockResolvedValueOnce({ data: {} })
    .mockResolvedValueOnce({ data: {} })
    .mockResolvedValueOnce({ data: { parents: [] } })
    .mockResolvedValueOnce({ data: { id: "s", name: "E" } });
  await crearPlanillaAsistenciaGoogle({ request } as never, conRoles);
  const cells = request.mock.calls[2]![0].data.requests.filter((r: any) => r.updateCells);
  const texto = (sheetId: number) =>
    JSON.stringify(cells.find((r: any) => r.updateCells.start.sheetId === sheetId)?.updateCells.rows);
  expect(texto(0)).not.toContain("Sala 01");
  expect(texto(0)).not.toContain("co@example.com");
  expect(texto(0)).toContain("Alumna Cumple");
  expect(texto(0)).toContain("Cerca del umbral");
  expect(texto(0)).toContain("Sin correo identificado");
  expect(texto(1)).toContain("Sala 01");
  expect(texto(1)).toContain("HOST");
  expect(texto(1)).toContain("COHOST");
  expect(texto(1)).not.toContain("Sin registro de conexión");
});
