import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const forbiddenModelNames = [
  "CuentaZoom",
  "EventoZoom",
  "AsistenteZoom",
  "SolicitudZoom",
  "Asistente",
  "InteresAsistenteEvento",
  "AsignacionAsistente",
  "DisponibilidadAsistente",
  "TarifaAsistencia",
  "Liquidacion",
  "LiquidacionDetalle",
];
const found = forbiddenModelNames.filter((name) =>
  new RegExp(`^model\\s+${name}\\s*\\{`, "m").test(schema),
);

if (found.length > 0) {
  console.error(`El schema conserva modelos anteriores: ${found.join(", ")}`);
  process.exit(1);
}

for (const expected of [
  "ProveedorReunion",
  "EventoProveedor",
  "InstanciaSala",
  "Grabacion",
  "UsuarioEmailAlias",
  "CuentaGoogleFlacso",
  "UsuarioFusion",
  "DocentePrograma",
  "AsistenteTecnico",
  "PostulacionAsistenciaTecnica",
  "AsignacionAsistenciaTecnica",
  "DisponibilidadAsistenteTecnico",
  "TarifaAsistenciaTecnica",
  "LiquidacionAsistenciaTecnica",
  "DetalleLiquidacionAsistenciaTecnica",
]) {
  if (!schema.includes(`model ${expected}`)) {
    console.error(`Falta modelo esperado: ${expected}`);
    process.exit(1);
  }
}

for (const forbiddenField of [
  "requiereAsistencia",
  "motivoAsistencia",
  "asistenteId",
  "tarifaAsistenciaId",
  "liquidacionId",
  "asignacionAsistenteId",
]) {
  if (new RegExp(`\\b${forbiddenField}\\b`).test(schema)) {
    console.error(`El schema conserva el nombre anterior: ${forbiddenField}.`);
    process.exit(1);
  }
}

if (schema.includes("CONTADURIA") || schema.includes("ADMINISTRADOR")) {
  console.error("Los roles anteriores deben migrarse al rol neutral ADMINISTRACION.");
  process.exit(1);
}

if (!schema.includes("cesadoHastaProximoInicioSesion Boolean")) {
  console.error("Falta el estado de cese temporal del asistente técnico.");
  process.exit(1);
}

console.log(
  "Schema validado: nombres de asistencia tecnica consistentes y Zoom historico separado.",
);
