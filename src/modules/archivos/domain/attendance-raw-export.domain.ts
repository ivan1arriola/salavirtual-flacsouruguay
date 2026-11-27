/**
 * Exportación de los registros brutos conservados en la planilla por instancia.
 * No agrega, deduplica ni cruza datos entre proveedores.
 * Nota: refleja el material sincronizado previamente, no todos los recursos de las APIs.
 */

export type FuenteExportacionAsistencia = "meet" | "reports";

export const COLUMNAS_BRUTAS_ASISTENCIA = [
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
] as const;

export type ExportacionBrutaAsistencia = Readonly<{
  columnas: readonly string[];
  registros: readonly (readonly (string | number | boolean | null)[])[];
  fuente: FuenteExportacionAsistencia;
}>;

export function seleccionarRegistrosBrutos(
  datosBrutos: readonly (readonly unknown[])[],
  fuente: FuenteExportacionAsistencia,
): ExportacionBrutaAsistencia {
  const seleccionados = datosBrutos.slice(1).filter((fila) => {
    const tipo = String(fila[0] ?? "")
      .trim()
      .toUpperCase();
    return fuente === "meet" ? tipo === "MEET" : tipo === "REPORTS" || tipo === "REPORTS_IDENTIDAD";
  });
  return {
    fuente,
    columnas: COLUMNAS_BRUTAS_ASISTENCIA,
    registros: seleccionados.map((fila) =>
      COLUMNAS_BRUTAS_ASISTENCIA.map((_, index) => {
        const valor = fila[index];
        return typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean"
          ? valor
          : null;
      }),
    ),
  };
}

/** Escape estándar RFC 4180; mitiga fórmulas al abrir archivos CSV en Excel. */
function campoCsv(valor: string | number | boolean | null): string {
  const original = valor == null ? "" : String(valor);
  const texto =
    /^[\s\uFEFF]*[=+\-@]/.test(original) || /^[\t\r]/.test(original) ? `'${original}` : original;
  return `"${texto.replaceAll('"', '""')}"`;
}

export function serializarExportacionCsv(datos: ExportacionBrutaAsistencia): string {
  const filas: readonly (readonly (string | number | boolean | null)[])[] = [
    datos.columnas,
    ...datos.registros,
  ];
  // BOM para caracteres en español con Excel. CRLF para compatibilidad.
  return "\uFEFF" + filas.map((fila) => fila.map(campoCsv).join(",")).join("\r\n") + "\r\n";
}

export function serializarExportacionJson(
  datos: ExportacionBrutaAsistencia,
  metadata: Readonly<{
    instanciaId: string;
    codigoMeet: string | null;
    inicioProgramadoAt: string;
    finProgramadoAt: string;
    exportadoAt: string;
  }>,
): string {
  return JSON.stringify(
    {
      ...metadata,
      fuente: datos.fuente,
      origenDatos: "ultima_planilla_sincronizada",
      nota: "Incluye todos los registros de esta fuente preservados en Datos brutos, no una extracción completa de todos los endpoints/eventos de Google.",
      columnas: datos.columnas,
      registros: datos.registros,
    },
    null,
    2,
  );
}
