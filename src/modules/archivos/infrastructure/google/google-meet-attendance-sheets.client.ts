import type { JWT } from "google-auth-library";
import { conReintentosGoogleLectura } from "@/src/integrations/google";
import type { CorreoAuditadoMeet, EventoAuditoriaMeet } from "./google-meet-audit-emails.client";
import { resumirIntervalosAsistencia } from "../../domain/meet-attendance-summary.domain";
import type { MovedDriveFile } from "../../domain";

export type MeetSheetSession = Readonly<{ nombre: string; tipo: string; inicio: string; fin: string; conferencia?: string; participanteId?: string; sesionId?: string }>;
export type MeetSheetInput = Readonly<{
  titulo: string;
  folderId: string;
  operationMarker: string;
  organizador: string;
  cohosts: readonly string[];
  inicio: Date;
  fin: Date;
  sesionesMeet: readonly MeetSheetSession[];
  correosAuditados: readonly CorreoAuditadoMeet[];
  eventosAuditoria: readonly EventoAuditoriaMeet[];
}>;

export async function buscarPlanillaAsistenciaDrive(auth: JWT, operationMarker: string): Promise<MovedDriveFile | null> {
  const escapeQuery = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
  const q = `appProperties has { key='meetAttendanceOperation' and value='${escapeQuery(operationMarker)}' } and mimeType = '${MIME}' and trashed = false`;
  const files: Array<{ id: string; name: string; mimeType?: string; webViewLink?: string }> = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ q, fields: "nextPageToken,files(id,name,mimeType,webViewLink)", pageSize: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await conReintentosGoogleLectura(() => auth.request<{ files?: typeof files; nextPageToken?: string }>({ url: `${DRIVE}?${params}`, method: "GET" }));
    files.push(...(response.data.files ?? []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  if (files.length > 1) throw new Error("Hay varias planillas con el mismo nombre en la carpeta; requiere conciliación administrativa.");
  const file = files[0];
  return file ? { id: file.id, name: file.name, mimeType: file.mimeType, webViewLink: file.webViewLink } : null;
}

const MIME = "application/vnd.google-apps.spreadsheet";
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE = "https://www.googleapis.com/drive/v3/files";

export async function planillaAsistenciaGoogleVacia(auth: JWT, spreadsheetId: string): Promise<boolean> {
  const params = new URLSearchParams({ fields: "valueRanges(range,values)" });
  for (const range of ["'Asistencia'!A:Z", "'Host y cohosts'!A:Z", "'Datos brutos'!A:N"]) {
    params.append("ranges", range);
  }
  const response = await conReintentosGoogleLectura(() => auth.request<{
    valueRanges?: Array<{ range?: string; values?: Array<Array<string | number | boolean>> }>;
  }>({
    url: `${SHEETS}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}`,
    method: "GET"
  }));
  const valueRanges = response.data.valueRanges;
  if (!valueRanges || valueRanges.length !== 3) {
    throw new Error("Google Sheets no devolvió todas las pestañas de la planilla.");
  }
  return valueRanges.every(({ values }) =>
    !values?.some((row) => row.some((value) => value !== "" && value !== null))
  );
}

function asUtcHour(iso: string): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "";
  return new Intl.DateTimeFormat("es-UY", {
    timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
  }).format(new Date(iso));
}

function safeCell(value: string): string {
  return /^[=+@\-\t\r]/.test(value) ? "'" + value : value;
}

function values(rows: readonly (readonly (string | number)[])[]) {
  return rows.map(row => row.map(v => typeof v === "number" ? { userEnteredValue: { numberValue: v } } : { userEnteredValue: { stringValue: safeCell(v) } }));
}

export async function crearPlanillaAsistenciaGoogle(auth: JWT, input: MeetSheetInput, spreadsheetId?: string) {
  const start = input.inicio.getTime(), end = input.fin.getTime();
  if (!(end > start)) throw new Error("Horario de asistencia inválido");
  const resumen: (string | number)[][] = [[
    "Participante", "Correo", "Primera conexión (UY)", "Última desconexión (UY)",
    "Minutos conectados", "Asistencia (%)", "Umbral de 5/6", "Conexiones"
  ]];
  const responsables: (string | number)[][] = [[
    "Participante", "Correo", "Rol", "Primera conexión (UY)", "Última desconexión (UY)", "Minutos conectados", "Conexiones"
  ]];
  const raw: (string | number)[][] = [[
    "Fuente", "Participante", "Correo", "Identificador", "Tipo", "Inicio (UTC)", "Fin (UTC)",
    "Duración (seg)", "Conferencia", "Endpoint", "Código Meet original", "Tipo identificador", "Timestamp auditoría", "Parámetros originales"
  ]];
  for (const r of input.correosAuditados) {
    const intervals = (r.conexiones ?? []).map(s => ({ start: Date.parse(s.inicio), end: Date.parse(s.fin) }))
      .filter(v => Number.isFinite(v.start) && Number.isFinite(v.end));
    const summary = resumirIntervalosAsistencia((r.conexiones ?? []).map(s => ({ inicio: s.inicio, fin: s.fin })), input.inicio, input.fin);
    const first = summary.primeraConexion ?? "";
    const last = summary.ultimaDesconexion ?? "";
    const roles = r.correo.toLowerCase() === input.organizador.toLowerCase() ? "HOST"
      : input.cohosts.some(email => email.toLowerCase() === r.correo.toLowerCase()) ? "COHOST" : "PARTICIPANTE";
    const mins = summary.minutosConectados;
    const ratio = summary.porcentaje / 100;
    const item = [r.nombre || r.correo, r.correo, asUtcHour(first), asUtcHour(last), mins,
      ratio, summary.cumpleCincoSextos ? "CUMPLE" : "MENOS DE 5/6", summary.conexiones];
    if (roles !== "PARTICIPANTE") responsables.push([item[0], item[1], roles, item[2], item[3], item[4], item[7]]);
    else resumen.push(item);
  }

  // Si no se obtuvieron correos de auditoría de Workspace, respaldar los participantes
  // desde las sesiones directas de Meet para que la pestaña Asistencia no quede vacía.
  if (input.correosAuditados.length === 0 && input.sesionesMeet.length > 0) {
    const sesionesPorParticipante = new Map<string, { nombre: string; sesiones: Array<{ inicio: string; fin: string }> }>();
    for (const s of input.sesionesMeet) {
      const key = s.participanteId || s.nombre;
      const prev = sesionesPorParticipante.get(key);
      if (prev) {
        prev.sesiones.push({ inicio: s.inicio, fin: s.fin });
      } else {
        sesionesPorParticipante.set(key, {
          nombre: s.nombre,
          sesiones: [{ inicio: s.inicio, fin: s.fin }]
        });
      }
    }
    for (const p of sesionesPorParticipante.values()) {
      const summary = resumirIntervalosAsistencia(p.sesiones, input.inicio, input.fin);
      const first = summary.primeraConexion ?? "";
      const last = summary.ultimaDesconexion ?? "";
      const mins = summary.minutosConectados;
      const ratio = summary.porcentaje / 100;
      resumen.push([
        p.nombre,
        "No informado por auditoría",
        asUtcHour(first),
        asUtcHour(last),
        mins,
        ratio,
        summary.cumpleCincoSextos ? "CUMPLE" : "MENOS DE 5/6",
        summary.conexiones
      ]);
    }
  }

  for (const event of input.eventosAuditoria) raw.push([
    "REPORTS", event.displayName, event.identifierType === "email_address" ? event.identifier : "", event.identifier,
    event.identifierType, new Date(Date.parse(event.timestamp) - event.durationSeconds * 1000).toISOString(), event.timestamp,
    event.durationSeconds, event.conferenceId, event.endpointId, event.meetingCode, event.identifierType, event.timestamp, JSON.stringify(event.parameters)
  ]);
  const reported = new Set(input.correosAuditados.map(r => r.correo.toLowerCase()));
  for (const [email, rol] of [[input.organizador, "HOST"], ...input.cohosts.map(e => [e, "COHOST CONFIGURADO"])] as string[][]) {
    if (!reported.has(email.toLowerCase())) responsables.push(["Sin registro de conexión", email, rol, "", "", 0, 0]);
  }
  for (const s of input.sesionesMeet) {
    raw.push([
      "MEET",
      s.nombre,
      "",
      s.participanteId ?? "",
      s.tipo,
      s.inicio,
      s.fin,
      Math.max(0, Math.round((Date.parse(s.fin) - Date.parse(s.inicio)) / 1000)),
      s.conferencia ?? "",
      s.sesionId ?? "",
      "",
      s.tipo,
      s.inicio,
      ""
    ]);
  }
  // Las sesiones de Meet se conservan en bruto, sin asociarlas por coincidencia de nombres.


  const tabs = [
    { title: "Asistencia", sheetId: 0, rows: resumen },
    { title: "Host y cohosts", sheetId: 1, rows: responsables },
    { title: "Datos brutos", sheetId: 2, rows: raw }
  ];
  const created = spreadsheetId ? null : await auth.request<{ spreadsheetId: string; spreadsheetUrl?: string }>({
    url: SHEETS, method: "POST", data: {
      properties: { title: input.titulo, locale: "es_UY", timeZone: "America/Montevideo" },
      sheets: tabs.map(t => ({ properties: { title: t.title, sheetId: t.sheetId, gridProperties: { frozenRowCount: 1, rowCount: Math.max(1000, t.rows.length + 10), columnCount: Math.max(10, t.rows[0]!.length) } } }))
    }
  });
  const id = spreadsheetId ?? created!.data.spreadsheetId;
  await auth.request({ url: `${DRIVE}/${encodeURIComponent(id)}?fields=id`, method: "PATCH", data: { appProperties: { meetAttendanceOperation: input.operationMarker } } });
  const requests: unknown[] = [];
  if (spreadsheetId && resumen.length > 1) {
    const current = await conReintentosGoogleLectura(() => auth.request<{ sheets?: Array<{ properties?: { sheetId?: number }; conditionalFormats?: unknown[] }> }>({
      url: `${SHEETS}/${encodeURIComponent(id)}?fields=sheets(properties(sheetId),conditionalFormats)`, method: "GET"
    }));
    const rules = current.data.sheets?.find(sheet => sheet.properties?.sheetId === 0)?.conditionalFormats ?? [];
    for (let index = rules.length - 1; index >= 0; index -= 1) {
      requests.push({ deleteConditionalFormatRule: { sheetId: 0, index } });
    }
  }
  for (const tab of tabs) {
    if (spreadsheetId) requests.push({ repeatCell: { range: { sheetId: tab.sheetId, startRowIndex: 0, endRowIndex: 50000 }, cell: {}, fields: "userEnteredValue" } });
    for (let i = 0; i < tab.rows.length; i += 400) {
      requests.push({ updateCells: {
        start: { sheetId: tab.sheetId, rowIndex: i, columnIndex: 0 },
        rows: values(tab.rows.slice(i, i + 400)).map(row => ({ values: row })),
        fields: "userEnteredValue"
      } });
    }
    requests.push({ repeatCell: {
      range: { sheetId: tab.sheetId, startRowIndex: 0, endRowIndex: 1 },
      cell: { userEnteredFormat: {
        backgroundColor: { red: 0.173, green: 0.278, blue: 0.467 },
        textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true }
      } }, fields: "userEnteredFormat"
    } });
    requests.push({ autoResizeDimensions: {
      dimensions: { sheetId: tab.sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: tab.rows[0]!.length }
    } });
  }
  if (resumen.length > 1) {
    requests.push({ repeatCell: { range: { sheetId: 0, startRowIndex: 1, endRowIndex: resumen.length, startColumnIndex: 5, endColumnIndex: 6 },
      cell: { userEnteredFormat: { numberFormat: { type: "PERCENT", pattern: "0.0%" } } }, fields: "userEnteredFormat.numberFormat" } });
  }
  if (spreadsheetId) await auth.request({ url: `${SHEETS}/${encodeURIComponent(id)}:batchUpdate`, method: "POST", data: { requests: tabs.map(t => ({ updateSheetProperties: { properties: { sheetId: t.sheetId, gridProperties: { rowCount: Math.max(50000, t.rows.length + 1) } }, fields: "gridProperties.rowCount" } })) } });
  await auth.request({ url: `${SHEETS}/${encodeURIComponent(id)}:batchUpdate`, method: "POST", data: { requests } });
  // Move the spreadsheet into the meeting folder; leave it in My Drive on permission failures rather than re-create it.
  const file = await conReintentosGoogleLectura(() => auth.request<{ parents?: string[] }>({
    url: `${DRIVE}/${encodeURIComponent(id)}?fields=parents`, method: "GET"
  }));
  const query = new URLSearchParams({ addParents: input.folderId, fields: "id,name,mimeType,webViewLink" });
  if (file.data.parents?.length) query.set("removeParents", file.data.parents.join(","));
  const moved = await auth.request<{ id: string; name: string; mimeType?: string; webViewLink?: string }>({
    url: `${DRIVE}/${encodeURIComponent(id)}?${query}`, method: "PATCH"
  });
  return { id, name: moved.data.name || input.titulo, mimeType: MIME, webViewLink: moved.data.webViewLink || `https://docs.google.com/spreadsheets/d/${id}/edit` };
}
