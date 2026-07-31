import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const forbiddenCoreNames = ["CuentaZoom", "EventoZoom", "AsistenteZoom", "SolicitudZoom"];
const found = forbiddenCoreNames.filter((name) => schema.includes(`model ${name}`));

if (found.length > 0) {
  console.error(`El schema nuevo no debe reintroducir modelos centrales Zoom: ${found.join(", ")}`);
  process.exit(1);
}

for (const expected of ["ProveedorReunion", "EventoProveedor", "InstanciaSala", "Grabacion"]) {
  if (!schema.includes(`model ${expected}`)) {
    console.error(`Falta modelo esperado: ${expected}`);
    process.exit(1);
  }
}

console.log("Schema validado: nucleo agnostico de proveedor y Zoom historico separado.");
