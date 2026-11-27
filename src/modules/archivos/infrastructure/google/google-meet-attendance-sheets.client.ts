import type { JWT } from "google-auth-library";
import { conReintentosGoogleLectura } from "@/src/integrations/google";
import type { CorreoAuditadoMeet, EventoAuditoriaMeet } from "./google-meet-audit-emails.client";
import { conciliarMeetReports } from "../../domain/meet-reports-reconciliation.domain";
import type { MovedDriveFile } from "../../domain";

export type MeetSheetSession = Readonly<{
  nombre: string;
  tipo: string;
  inicio: string;
  fin: string;
  conferencia?: string;
  participanteId?: string;
  sesionId?: string;
  correoVerificado?: string;
}>;
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

export async function buscarPlanillaAsistenciaDrive(
  auth: JWT,
  operationMarker: string,
): Promise<MovedDriveFile | null> {
  const escapeQuery = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
  const q = `appProperties has { key='meetAttendanceOperation' and value='${escapeQuery(operationMarker)}' } and mimeType = '${MIME}' and trashed = false`;
  const files: Array<{ id: string; name: string; mimeType?: string; webViewLink?: string }> = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q,
      fields: "nextPageToken,files(id,name,mimeType,webViewLink)",
      pageSize: "100",
    });
    if (pageToken) {
      params.set("pageToken", pageToken);
    }
    const response = await conReintentosGoogleLectura(() =>
      auth.request<{ files?: typeof files; nextPageToken?: string }>({
        url: `${DRIVE}?${params}`,
        method: "GET",
      }),
    );
    files.push(...(response.data.files ?? []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  if (files.length > 1) {
    throw new Error(
      "Hay varias planillas con el mismo nombre en la carpeta; requiere conciliación administrativa.",
    );
  }
  const file = files[0];
  return file
    ? { id: file.id, name: file.name, mimeType: file.mimeType, webViewLink: file.webViewLink }
    : null;
}

const MIME = "application/vnd.google-apps.spreadsheet";
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE = "https://www.googleapis.com/drive/v3/files";

export async function planillaAsistenciaGoogleVacia(
  auth: JWT,
  spreadsheetId: string,
): Promise<boolean> {
  // Los encabezados y las filas informativas del host no prueban que haya
  // asistencia. Inspeccionar únicamente filas de datos de ambas pestañas.
  const params = new URLSearchParams({ fields: "valueRanges(range,values)" });
  for (const range of ["'Asistencia'!A2:Z", "'Datos brutos'!A2:N"]) {
    params.append("ranges", range);
  }
  const response = await conReintentosGoogleLectura(() =>
    auth.request<{
      valueRanges?: Array<{ range?: string; values?: Array<Array<string | number | boolean>> }>;
    }>({
      url: `${SHEETS}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}`,
      method: "GET",
    }),
  );
  const valueRanges = response.data.valueRanges;
  if (!valueRanges || valueRanges.length !== 2) {
    throw new Error("Google Sheets no devolvió las pestañas de asistencia y datos brutos.");
  }
  return valueRanges.every(
    ({ values }) => !values?.some((row) => row.some((value) => value !== "" && value !== null)),
  );
}

function asUtcHour(iso: string): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) {
    return "";
  }
  return new Intl.DateTimeFormat("es-UY", {
    timeZone: "America/Montevideo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function safeCell(value: string): string {
  return /^[=+@\-\t\r]/.test(value) ? "'" + value : value;
}

function values(rows: readonly (readonly (string | number)[])[]) {
  return rows.map((row) =>
    row.map((v) =>
      typeof v === "number"
        ? { userEnteredValue: { numberValue: v } }
        : { userEnteredValue: { stringValue: safeCell(v) } },
    ),
  );
}

export async function crearPlanillaAsistenciaGoogle(
  auth: JWT,
  input: MeetSheetInput,
  spreadsheetId?: string,
) {
  const start = input.inicio.getTime(),
    end = input.fin.getTime();
  if (!(end > start)) {
    throw new Error("Horario de asistencia inválido");
  }
  const resumen: (string | number)[][] = [
    [
      "Participante",
      "Correo",
      "Primera conexión (UY)",
      "Última desconexión (UY)",
      "Minutos conectados",
      "Asistencia (%)",
      "Umbral de 5/6",
      "Conexiones",
      "Observaciones",
    ],
  ];
  const responsables: (string | number)[][] = [
    [
      "Participante",
      "Correo",
      "Rol",
      "Primera conexión (UY)",
      "Última desconexión (UY)",
      "Minutos conectados",
      "Conexiones",
    ],
  ];
  const raw: (string | number)[][] = [
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
      "Parámetros originales",
    ],
  ];
  // Meet es la fuente primaria. Las identidades Reports sin clave común se
  // conservan para revisión, pero no sustituyen ni duplican personas Meet.
  const conciliacion = conciliarMeetReports(
    input.sesionesMeet,
    input.eventosAuditoria.map((e) => ({
      nombre: e.displayName,
      identificador: e.identifier,
      tipoIdentificador: e.identifierType,
      conferenciaId: e.conferenceId,
      endpointId: e.endpointId,
      inicio: new Date(Date.parse(e.timestamp) - e.durationSeconds * 1000).toISOString(),
      fin: e.timestamp,
      timestamp: e.timestamp,
    })),
    input.inicio,
    input.fin,
  );
  // Host y cohosts configurados se separan del resto por correo (atribuido por
  // horario o verificado); nunca por coincidencia de nombres.
  const rolPorCorreo = new Map<string, string>([
    [input.organizador.toLowerCase(), "HOST"],
    ...input.cohosts.map((email) => [email.toLowerCase(), "COHOST"] as const),
  ]);
  const duracionMin = (end - start) / 60_000;
  const correoCompartido = conciliacion.meet.reduce<Readonly<Record<string, readonly string[]>>>(
    (acc, p) => (p.correo ? { ...acc, [p.correo]: [...(acc[p.correo] ?? []), p.nombre] } : acc),
    {},
  );
  const umbralMin = (duracionMin * 5) / 6;
  const observaciones = (p: (typeof conciliacion.meet)[number]): string =>
    [
      !p.correo ? "Sin correo identificado" : null,
      p.correo && (correoCompartido[p.correo]?.length ?? 0) > 1
        ? `Correo compartido con: ${(correoCompartido[p.correo] ?? []).filter((n) => n !== p.nombre).join(", ")}`
        : null,
      p.resumen.minutosConectados === 0
        ? "Sin tiempo dentro del horario de la reunión"
        : Math.abs(p.resumen.minutosConectados - umbralMin) <= 5
          ? "Cerca del umbral (±5 min)"
          : null,
      p.sesiones >= 5 ? `Muchas reconexiones (${p.sesiones})` : null,
    ]
      .filter((x): x is string => x !== null)
      .join("; ");
  const responsablesMeet = new Set<string>();
  for (const participante of conciliacion.meet) {
    const summary = participante.resumen;
    const rol = participante.correo
      ? rolPorCorreo.get(participante.correo.toLowerCase())
      : undefined;
    if (rol) {
      responsablesMeet.add(participante.correo!.toLowerCase());
      responsables.push([
        participante.nombre,
        participante.correo!,
        rol,
        asUtcHour(summary.primeraConexion ?? ""),
        asUtcHour(summary.ultimaDesconexion ?? ""),
        summary.minutosConectados,
        summary.conexiones,
      ]);
      continue;
    }
    resumen.push([
      participante.nombre,
      participante.correo ?? "No informado por auditoría",
      asUtcHour(summary.primeraConexion ?? ""),
      asUtcHour(summary.ultimaDesconexion ?? ""),
      summary.minutosConectados,
      summary.porcentaje / 100,
      summary.cumpleCincoSextos ? "CUMPLE" : "MENOS DE 5/6",
      summary.conexiones,
      observaciones(participante),
    ]);
  }

  // El host y los cohosts se muestran aparte solo cuando su dirección
  // institucional está configurada, no por nombres coincidentes en Meet.
  for (const r of input.correosAuditados) {
    const roles =
      r.correo.toLowerCase() === input.organizador.toLowerCase()
        ? "HOST"
        : input.cohosts.some((email) => email.toLowerCase() === r.correo.toLowerCase())
          ? "COHOST"
          : null;
    if (!roles || responsablesMeet.has(r.correo.toLowerCase())) {
      continue;
    }
    const summary = conciliarMeetReports(
      [],
      (r.conexiones ?? []).map((s) => ({
        nombre: s.nombre,
        identificador: r.correo,
        tipoIdentificador: "email_address",
        conferenciaId: r.conferenciaId,
        endpointId: s.endpointId ?? "",
        inicio: s.inicio,
        fin: s.fin,
        timestamp: s.timestamp ?? s.fin,
      })),
      input.inicio,
      input.fin,
    ).reports[0]?.resumen;
    responsables.push([
      r.nombre || r.correo,
      r.correo,
      roles,
      asUtcHour(summary?.primeraConexion ?? ""),
      asUtcHour(summary?.ultimaDesconexion ?? ""),
      summary?.minutosConectados ?? 0,
      summary?.conexiones ?? 0,
    ]);
  }

  for (const event of input.eventosAuditoria) {
    raw.push([
      "REPORTS",
      event.displayName,
      event.identifierType === "email_address" ? event.identifier : "",
      event.identifier,
      event.identifierType,
      new Date(Date.parse(event.timestamp) - event.durationSeconds * 1000).toISOString(),
      event.timestamp,
      event.durationSeconds,
      event.conferenceId,
      event.endpointId,
      event.meetingCode,
      event.identifierType,
      event.timestamp,
      JSON.stringify(event.parameters),
    ]);
  }
  // Mantener también la atribución de correos cuando el endpoint de auditoría
  // no trae un evento utilizable en el lote de datos brutos.
  for (const r of input.correosAuditados) {
    for (const s of r.conexiones ?? []) {
      raw.push([
        "REPORTS_IDENTIDAD",
        r.nombre ?? r.correo,
        r.correo,
        r.correo,
        "email_address",
        s.inicio,
        s.fin,
        s.duracionSegundos,
        r.conferenciaId,
        s.endpointId ?? "",
        s.meetingCode ?? "",
        "email_address",
        s.timestamp ?? s.fin,
        "",
      ]);
    }
  }
  const reported = new Set([
    ...input.correosAuditados.map((r) => r.correo.toLowerCase()),
    ...responsablesMeet,
  ]);
  for (const [email, rol] of [
    [input.organizador, "HOST"],
    ...input.cohosts.map((e) => [e, "COHOST CONFIGURADO"]),
  ] as string[][]) {
    if (!reported.has(email.toLowerCase())) {
      responsables.push(["Sin registro de conexión", email, rol, "", "", 0, 0]);
    }
  }
  for (const s of input.sesionesMeet) {
    raw.push([
      "MEET",
      s.nombre,
      s.correoVerificado ?? "",
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
      "",
    ]);
  }
  // Las sesiones de Meet se conservan en bruto, sin asociarlas por coincidencia de nombres.

  const tabs = [
    { title: "Asistencia", sheetId: 0, rows: resumen },
    { title: "Host y cohosts", sheetId: 1, rows: responsables },
    { title: "Datos brutos", sheetId: 2, rows: raw },
  ];
  const created = spreadsheetId
    ? null
    : await auth.request<{ spreadsheetId: string; spreadsheetUrl?: string }>({
        url: SHEETS,
        method: "POST",
        data: {
          properties: { title: input.titulo, locale: "es_UY", timeZone: "America/Montevideo" },
          sheets: tabs.map((t) => ({
            properties: {
              title: t.title,
              sheetId: t.sheetId,
              gridProperties: {
                frozenRowCount: 1,
                rowCount: Math.max(1000, t.rows.length + 10),
                columnCount: Math.max(10, t.rows[0]!.length),
              },
            },
          })),
        },
      });
  const id = spreadsheetId ?? created!.data.spreadsheetId;
  await auth.request({
    url: `${DRIVE}/${encodeURIComponent(id)}?fields=id`,
    method: "PATCH",
    data: { appProperties: { meetAttendanceOperation: input.operationMarker } },
  });
  const requests: unknown[] = [];
  if (spreadsheetId && resumen.length > 1) {
    const current = await conReintentosGoogleLectura(() =>
      auth.request<{
        sheets?: Array<{ properties?: { sheetId?: number }; conditionalFormats?: unknown[] }>;
      }>({
        url: `${SHEETS}/${encodeURIComponent(id)}?fields=sheets(properties(sheetId),conditionalFormats)`,
        method: "GET",
      }),
    );
    const rules =
      current.data.sheets?.find((sheet) => sheet.properties?.sheetId === 0)?.conditionalFormats ??
      [];
    for (let index = rules.length - 1; index >= 0; index -= 1) {
      requests.push({ deleteConditionalFormatRule: { sheetId: 0, index } });
    }
  }
  for (const tab of tabs) {
    if (spreadsheetId) {
      requests.push({
        repeatCell: {
          range: { sheetId: tab.sheetId, startRowIndex: 0, endRowIndex: 50000 },
          cell: {},
          fields: "userEnteredValue",
        },
      });
    }
    for (let i = 0; i < tab.rows.length; i += 400) {
      requests.push({
        updateCells: {
          start: { sheetId: tab.sheetId, rowIndex: i, columnIndex: 0 },
          rows: values(tab.rows.slice(i, i + 400)).map((row) => ({ values: row })),
          fields: "userEnteredValue",
        },
      });
    }
    requests.push({
      repeatCell: {
        range: { sheetId: tab.sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.173, green: 0.278, blue: 0.467 },
            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
          },
        },
        fields: "userEnteredFormat",
      },
    });
    requests.push({
      autoResizeDimensions: {
        dimensions: {
          sheetId: tab.sheetId,
          dimension: "COLUMNS",
          startIndex: 0,
          endIndex: tab.rows[0]!.length,
        },
      },
    });
  }
  if (resumen.length > 1) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: 0,
          startRowIndex: 1,
          endRowIndex: resumen.length,
          startColumnIndex: 5,
          endColumnIndex: 6,
        },
        cell: { userEnteredFormat: { numberFormat: { type: "PERCENT", pattern: "0.0%" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    });

    // Semáforo sobre porcentaje y umbral: verde = cumple 5/6, amarillo = desde 75 %, rojo = menos de 75 %.
    const rango = [
      {
        sheetId: 0,
        startRowIndex: 1,
        endRowIndex: resumen.length,
        startColumnIndex: 5,
        endColumnIndex: 7,
      },
    ];
    const reglas: ReadonlyArray<readonly [string, { red: number; green: number; blue: number }]> = [
      ["=$F2>=5/6", { red: 0.776, green: 0.937, blue: 0.808 }],
      ["=($F2>=3/4)*($F2<5/6)>0", { red: 1, green: 0.922, blue: 0.612 }],
      ["=$F2<3/4", { red: 1, green: 0.78, blue: 0.808 }],
    ];
    reglas.forEach(([formula, color], index) =>
      requests.push({
        addConditionalFormatRule: {
          index,
          rule: {
            ranges: rango,
            booleanRule: {
              condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: formula }] },
              format: { backgroundColor: color },
            },
          },
        },
      }),
    );
  }
  if (spreadsheetId) {
    await auth.request({
      url: `${SHEETS}/${encodeURIComponent(id)}:batchUpdate`,
      method: "POST",
      data: {
        requests: tabs.map((t) => ({
          updateSheetProperties: {
            properties: {
              sheetId: t.sheetId,
              gridProperties: { rowCount: Math.max(50000, t.rows.length + 1) },
            },
            fields: "gridProperties.rowCount",
          },
        })),
      },
    });
  }
  await auth.request({
    url: `${SHEETS}/${encodeURIComponent(id)}:batchUpdate`,
    method: "POST",
    data: { requests },
  });
  // Move the spreadsheet into the meeting folder; leave it in My Drive on permission failures rather than re-create it.
  const file = await conReintentosGoogleLectura(() =>
    auth.request<{ parents?: string[] }>({
      url: `${DRIVE}/${encodeURIComponent(id)}?fields=parents`,
      method: "GET",
    }),
  );
  const query = new URLSearchParams({
    addParents: input.folderId,
    fields: "id,name,mimeType,webViewLink",
  });
  if (file.data.parents?.length) {
    query.set("removeParents", file.data.parents.join(","));
  }
  try {
    const moved = await auth.request<{
      id: string;
      name: string;
      mimeType?: string;
      webViewLink?: string;
    }>({
      url: `${DRIVE}/${encodeURIComponent(id)}?${query}`,
      method: "PATCH",
    });
    return {
      id,
      name: moved.data.name || input.titulo,
      mimeType: MIME,
      webViewLink: moved.data.webViewLink || `https://docs.google.com/spreadsheets/d/${id}/edit`,
    };
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status !== 403 && status !== 404) {
      throw error;
    }
    // Los datos ya están escritos; la falta de acceso a la carpeta no invalida la planilla.
    return {
      id,
      name: input.titulo,
      mimeType: MIME,
      webViewLink: `https://docs.google.com/spreadsheets/d/${id}/edit`,
    };
  }
}
