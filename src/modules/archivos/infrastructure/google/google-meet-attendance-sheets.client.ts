import type { JWT } from "google-auth-library";
import { conReintentosGoogleLectura } from "@/src/integrations/google";
import type { CorreoAuditadoMeet } from "./google-meet-audit-emails.client";

export type MeetSheetSession = Readonly<{ nombre: string; tipo: string; inicio: string; fin: string }>;
export type MeetSheetInput = Readonly<{
  titulo: string;
  folderId: string;
  organizador: string;
  inicio: Date;
  fin: Date;
  sesionesMeet: readonly MeetSheetSession[];
  correosAuditados: readonly CorreoAuditadoMeet[];
}>;

const MIME = "application/vnd.google-apps.spreadsheet";
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE = "https://www.googleapis.com/drive/v3/files";

function asUtcHour(iso: string): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "";
  return new Intl.DateTimeFormat("es-UY", {
    timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).format(new Date(iso));
}

function safeCell(value: string): string {
  return /^[=+@\-\t\r]/.test(value) ? "'" + value : value;
}

type Interval = { start: number; end: number };
function mergeDuration(items: readonly Interval[], start: number, end: number) {
  const filtered = items.map(v => ({ start: Math.max(start, v.start), end: Math.min(end, v.end) }))
    .filter(v => v.end > v.start).sort((a, b) => a.start - b.start);
  let total = 0, first = Infinity, last = -Infinity, until = -Infinity;
  for (const part of filtered) {
    first = Math.min(first, part.start); last = Math.max(last, part.end);
    total += Math.max(0, part.end - Math.max(part.start, until));
    until = Math.max(until, part.end);
  }
  return { first, last, minutes: total / 60000 };
}

function values(rows: readonly (readonly (string | number)[])[]) {
  return rows.map(row => row.map(v => typeof v === "number" ? { userEnteredValue: { numberValue: v } } : { userEnteredValue: { stringValue: safeCell(v) } }));
}

export async function crearPlanillaAsistenciaGoogle(auth: JWT, input: MeetSheetInput) {
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
    "Duración (seg)", "Conferencia"
  ]];
  for (const r of input.correosAuditados) {
    const intervals = (r.conexiones ?? []).map(s => ({ start: Date.parse(s.inicio), end: Date.parse(s.fin) }))
      .filter(v => Number.isFinite(v.start) && Number.isFinite(v.end));
    const duration = mergeDuration(intervals, start, end);
    const first = Number.isFinite(duration.first) ? new Date(duration.first).toISOString() : "";
    const last = Number.isFinite(duration.last) ? new Date(duration.last).toISOString() : "";
    const roles = r.correo.toLowerCase() === input.organizador.toLowerCase() ? "HOST" : "PARTICIPANTE";
    const mins = Math.round(duration.minutes * 100) / 100;
    const ratio = Math.min(1, duration.minutes / ((end - start) / 60000));
    const item = [r.nombre || r.correo, r.correo, asUtcHour(first), asUtcHour(last), mins,
      ratio, ratio >= 5 / 6 ? "CUMPLE" : "MENOS DE 5/6", (r.conexiones ?? []).length];
    if (roles === "HOST") responsables.push([item[0], item[1], roles, item[2], item[3], item[4], item[7]]);
    else resumen.push(item);
    for (const s of r.conexiones ?? []) raw.push([
      "REPORTS", s.nombre || r.nombre || "", r.correo, s.identificador, "email_address",
      s.inicio, s.fin, s.duracionSegundos, r.conferenciaId
    ]);
  }
  for (const s of input.sesionesMeet) {
    raw.push(["MEET", s.nombre, "", "", s.tipo, s.inicio, s.fin,
      Math.max(0, (Date.parse(s.fin) - Date.parse(s.inicio)) / 1000), ""]);
  }
  // Las sesiones de Meet se conservan en bruto, sin asociarlas por coincidencia de nombres.


  const tabs = [
    { title: "Asistencia", sheetId: 0, rows: resumen },
    { title: "Host y cohosts", sheetId: 1, rows: responsables },
    { title: "Datos brutos", sheetId: 2, rows: raw }
  ];
  const created = await auth.request<{ data?: unknown; spreadsheetId: string; spreadsheetUrl?: string }>({
    url: SHEETS, method: "POST", data: {
      properties: { title: input.titulo, locale: "es_UY", timeZone: "America/Montevideo" },
      sheets: tabs.map(t => ({ properties: { title: t.title, sheetId: t.sheetId, gridProperties: { frozenRowCount: 1 } } }))
    }
  });
  const id = created.data.spreadsheetId;
  const requests: unknown[] = [];
  for (const tab of tabs) {
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
    requests.push({ addConditionalFormatRule: { index: 0, rule: {
      ranges: [{ sheetId: 0, startRowIndex: 1, endRowIndex: resumen.length, startColumnIndex: 5, endColumnIndex: 6 }],
      gradientRule: {
        minpoint: { color: { red: 0.90, green: 0.25, blue: 0.25 }, type: "NUMBER", value: "0" },
        midpoint: { color: { red: 1, green: 0.83, blue: 0.36 }, type: "NUMBER", value: "0.5" },
        maxpoint: { color: { red: 0.21, green: 0.67, blue: 0.37 }, type: "NUMBER", value: "1" }
      }
    } } });
  }
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
