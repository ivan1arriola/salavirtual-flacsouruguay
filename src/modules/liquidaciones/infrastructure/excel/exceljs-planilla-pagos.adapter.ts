import ExcelJS from "exceljs";
import { etiquetaMes, type FilaPlanillaPago, type PeriodoReporteMensual } from "../../domain";
import type { PlanillaPagosExporterPort } from "../../ports";

const COLORS = {
  navy: "FF18385C",
  teal: "FF147B83",
  tealLight: "FFE8F3F4",
  headerLight: "FFDCE8EF",
  line: "FFD2DCE4",
  text: "FF20344D",
  muted: "FF637083",
  white: "FFFFFFFF",
  alternate: "FFF7FAFC",
  warning: "FFFFF1D6",
  danger: "FFFDE7E7"
} as const;

const visibleColumns = [
  { header: "Asistente", width: 28 },
  { header: "Programa", width: 34 },
  { header: "Reunión", width: 40 },
  { header: "Fecha", width: 14 },
  { header: "Cantidad de horas", width: 18 },
  { header: "Modalidad", width: 15 },
  { header: "Valor calculado en pesos", width: 24 }
] as const;

export function crearExceljsPlanillaPagosAdapter(): PlanillaPagosExporterPort {
  return {
    async generarPlanillaPagosExcel(
      periodo: PeriodoReporteMensual,
      filas: readonly FilaPlanillaPago[]
    ): Promise<Buffer> {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Sala Virtual FLACSO Uruguay";
      workbook.created = new Date();
      workbook.modified = new Date();
      workbook.calcProperties.fullCalcOnLoad = true;

      const porAsistente = [...filas].sort(compareBy("asistente", "programa"));
      const porPrograma = [...filas].sort(compareBy("programa", "asistente"));

      buildSheet(workbook, "Pagos por asistente", porAsistente, "asistente", "Pago total");
      buildSheet(workbook, "Pagos por programa", porPrograma, "programa", "Gasto total");

      for (const sheet of workbook.worksheets) {
        addDocumentHeader(sheet, periodo);
      }

      const data = await workbook.xlsx.writeBuffer();
      return Buffer.from(data);
    }
  };
}

function buildSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  filas: readonly FilaPlanillaPago[],
  groupKey: "asistente" | "programa",
  totalLabel: string
): void {
  const sheet = workbook.addWorksheet(name, {
    properties: { defaultRowHeight: 20 }
  });

  visibleColumns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width;
  });

  sheet.getColumn(8).width = 14;
  sheet.getColumn(9).width = 16;
  sheet.getColumn(10).width = 10;
  sheet.getColumn(8).hidden = true;
  sheet.getColumn(9).hidden = true;
  sheet.getColumn(10).hidden = true;
  sheet.views = [{ state: "frozen", ySplit: 2 }];

  let rowIndex = 4;
  const groups = groupRows(filas, groupKey);

  if (groups.length === 0) {
    sheet.mergeCells(rowIndex, 1, rowIndex, 7);
    const cell = sheet.getCell(rowIndex, 1);
    cell.value = "No hay reuniones asignadas en el período.";
    cell.font = { italic: true, color: { argb: COLORS.muted } };
    cell.alignment = { vertical: "middle" };
    cell.fill = solid(COLORS.tealLight);
    sheet.getRow(rowIndex).height = 30;
    return;
  }

  for (const [groupName, groupRowsValue] of groups) {
    styleGroupTitle(
      sheet,
      rowIndex,
      groupKey === "asistente" ? `Asistente: ${groupName}` : `Programa: ${groupName}`
    );
    rowIndex += 1;
    styleColumnHeader(sheet, rowIndex);
    rowIndex += 1;

    const firstDataRow = rowIndex;
    let total = 0;

    for (const item of groupRowsValue) {
      const row = sheet.getRow(rowIndex);
      row.values = [
        item.asistente,
        item.programa,
        item.reunion,
        fechaLocalExcel(item.fecha),
        item.minutos / 60,
        item.modalidad === "VIRTUAL" ? "Virtual" : "Híbrida",
        null,
        item.tarifaHora,
        item.montoConfirmado,
        item.moneda
      ];

      row.getCell(4).numFmt = "dd/mm/yyyy";
      row.getCell(5).numFmt = "0.00";
      row.getCell(7).numFmt = '"$" #,##0.00';
      row.getCell(7).value = formulaAmount(rowIndex, item);
      styleDataRow(row, rowIndex - firstDataRow);

      if (item.moneda === "UYU" && item.montoCalculado !== null) {
        total += roundMoney(item.montoCalculado);
      } else {
        const amountCell = row.getCell(7);
        amountCell.fill = solid(item.moneda === "UYU" ? COLORS.warning : COLORS.danger);
        amountCell.font = { bold: true, color: { argb: COLORS.text } };
        amountCell.note =
          item.moneda === "UYU"
            ? "Esta reunión no tiene una tarifa aplicable ni un monto confirmado."
            : `El importe está registrado en ${item.moneda}; no se convierte automáticamente a pesos uruguayos.`;
      }

      rowIndex += 1;
    }

    const lastDataRow = rowIndex - 1;
    sheet.mergeCells(rowIndex, 1, rowIndex, 6);
    const labelCell = sheet.getCell(rowIndex, 1);
    labelCell.value = `${totalLabel} — ${groupName}`;
    labelCell.font = { bold: true, color: { argb: COLORS.navy } };
    labelCell.alignment = { horizontal: "right", vertical: "middle" };

    const totalCell = sheet.getCell(rowIndex, 7);
    totalCell.value = {
      formula: `SUM(G${firstDataRow}:G${lastDataRow})`,
      result: roundMoney(total)
    };
    totalCell.numFmt = '"$" #,##0.00';
    totalCell.font = { bold: true, color: { argb: COLORS.navy } };
    totalCell.alignment = { horizontal: "right", vertical: "middle" };

    for (let column = 1; column <= 7; column += 1) {
      const cell = sheet.getCell(rowIndex, column);
      cell.fill = solid(COLORS.tealLight);
      cell.border = {
        top: { style: "medium", color: { argb: COLORS.teal } },
        bottom: { style: "thin", color: { argb: COLORS.line } }
      };
    }
    sheet.getRow(rowIndex).height = 26;
    rowIndex += 2;
  }
}

function addDocumentHeader(sheet: ExcelJS.Worksheet, periodo: PeriodoReporteMensual): void {
  const month = etiquetaMes(periodo.clave);
  const title = `Planilla de pagos de monitoreo — ${capitalize(month)}`;

  sheet.mergeCells("A1:G1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = title;
  titleCell.fill = solid(COLORS.navy);
  titleCell.font = { bold: true, size: 16, color: { argb: COLORS.white } };
  titleCell.alignment = { horizontal: "left", vertical: "middle" };
  sheet.getRow(1).height = 32;

  sheet.mergeCells("A2:G2");
  const subtitle = sheet.getCell("A2");
  subtitle.value =
    "Los valores y los totales usan fórmulas. Las tarifas y montos confirmados quedan como columnas auxiliares ocultas para poder auditar el cálculo.";
  subtitle.fill = solid(COLORS.headerLight);
  subtitle.font = { size: 10, color: { argb: COLORS.muted } };
  subtitle.alignment = { wrapText: true, vertical: "middle" };
  sheet.getRow(2).height = 32;
}

function styleGroupTitle(sheet: ExcelJS.Worksheet, rowIndex: number, title: string): void {
  sheet.mergeCells(rowIndex, 1, rowIndex, 7);
  const cell = sheet.getCell(rowIndex, 1);
  cell.value = title;
  cell.fill = solid(COLORS.teal);
  cell.font = { bold: true, size: 12, color: { argb: COLORS.white } };
  cell.alignment = { vertical: "middle" };
  sheet.getRow(rowIndex).height = 27;
}

function styleColumnHeader(sheet: ExcelJS.Worksheet, rowIndex: number): void {
  const row = sheet.getRow(rowIndex);
  row.values = visibleColumns.map(({ header }) => header);
  row.height = 30;

  for (let column = 1; column <= 7; column += 1) {
    const cell = row.getCell(column);
    cell.fill = solid(COLORS.navy);
    cell.font = { bold: true, color: { argb: COLORS.white } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder();
  }
}

function styleDataRow(row: ExcelJS.Row, indexInGroup: number): void {
  row.height = 23;
  for (let column = 1; column <= 7; column += 1) {
    const cell = row.getCell(column);
    cell.fill = solid(indexInGroup % 2 === 0 ? COLORS.white : COLORS.alternate);
    cell.font = { color: { argb: COLORS.text } };
    cell.border = thinBorder();
    cell.alignment = {
      vertical: "middle",
      wrapText: column <= 3,
      horizontal: column === 5 || column === 7 ? "right" : "left"
    };
  }
}

function formulaAmount(rowIndex: number, item: FilaPlanillaPago): ExcelJS.CellFormulaValue {
  const result: string | number =
    item.moneda !== "UYU"
      ? `REVISAR ${item.moneda}`
      : item.montoCalculado === null
        ? "SIN TARIFA"
        : roundMoney(item.montoCalculado);

  return {
    formula: `IF(J${rowIndex}<>"UYU","REVISAR "&J${rowIndex},IF(I${rowIndex}<>"",ROUND(I${rowIndex},2),IF(H${rowIndex}="","SIN TARIFA",ROUND(E${rowIndex}*H${rowIndex},2))))`,
    result
  };
}

function groupRows(
  filas: readonly FilaPlanillaPago[],
  key: "asistente" | "programa"
): ReadonlyArray<readonly [string, readonly FilaPlanillaPago[]]> {
  const groups = new Map<string, FilaPlanillaPago[]>();
  for (const fila of filas) {
    const value = fila[key] || "Sin especificar";
    const current = groups.get(value) ?? [];
    current.push(fila);
    groups.set(value, current);
  }
  return [...groups.entries()].map(([name, rows]) => [name, rows] as const);
}

function compareBy(
  primary: "asistente" | "programa",
  secondary: "asistente" | "programa"
): (a: FilaPlanillaPago, b: FilaPlanillaPago) => number {
  return (a, b) =>
    a[primary].localeCompare(b[primary], "es") ||
    a[secondary].localeCompare(b[secondary], "es") ||
    a.fecha.getTime() - b.fecha.getTime() ||
    a.reunion.localeCompare(b.reunion, "es");
}

function fechaLocalExcel(fecha: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montevideo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(fecha);
  const value = (type: "year" | "month" | "day") => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day"), 12));
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function capitalize(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function thinBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: "thin", color: { argb: COLORS.line } },
    left: { style: "thin", color: { argb: COLORS.line } },
    bottom: { style: "thin", color: { argb: COLORS.line } },
    right: { style: "thin", color: { argb: COLORS.line } }
  };
}
