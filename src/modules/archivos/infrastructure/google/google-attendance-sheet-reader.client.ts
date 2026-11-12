import type { JWT } from "google-auth-library";
import { conReintentosGoogleLectura } from "@/src/integrations/google";
import type { DatosPlanillaAsistencia } from "../../domain/attendance-view.domain";

type ValueRange = Readonly<{ values?: unknown[][] }>;
type SheetsResponse = Readonly<{ valueRanges?: ValueRange[] }>;

/** Read-only query for the spreadsheet already registered against this encounter. */
export async function leerPlanillaAsistenciaGoogle(
  auth: JWT,
  spreadsheetId: string
): Promise<DatosPlanillaAsistencia> {
  const params = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE" });
  for (const name of ["Asistencia", "Host y cohosts", "Datos brutos"]) {
    const columns = name === "Datos brutos" ? "A:N" : name === "Asistencia" ? "A:H" : "A:G";
    params.append("ranges", `'${name}'!${columns}`);
  }
  const response = await conReintentosGoogleLectura(() =>
    auth.request<SheetsResponse>({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}`,
      method: "GET",
      timeout: 20_000
    })
  );
  const ranges = response.data.valueRanges;
  if (!ranges || ranges.length !== 3) {
    throw new Error("La planilla no tiene el formato de asistencia esperado.");
  }
  return {
    asistencia: ranges[0]?.values ?? [],
    responsables: ranges[1]?.values ?? [],
    datosBrutos: ranges[2]?.values ?? []
  };
}
