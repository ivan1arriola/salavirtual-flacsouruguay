export type AmbitoInscriptos = Readonly<{
  tipo: "ENCUENTRO" | "SERIE" | "DESCONOCIDO";
  occurrenceId?: string;
}>;

export type InscriptoZoom = Readonly<{
  id: string;
  nombre: string;
  email: string;
  estado: "approved" | "pending" | "denied";
  fecha: string | null;
}>;

export type ResultadoInscriptosZoom = Readonly<{
  estado: "DISPONIBLE" | "PARCIAL" | "NO_HABILITADA" | "SIN_VERIFICAR";
  ambito: AmbitoInscriptos;
  personas: readonly InscriptoZoom[];
}>;

export function elegirAmbitoInscriptos(
  tipo: number | null | undefined,
  ocurrencias: unknown,
  inicio: Date
): AmbitoInscriptos {
  if (tipo === 2) {
    return { tipo: "ENCUENTRO" };
  }
  if (tipo !== 8) {
    return { tipo: tipo === 3 ? "SERIE" : "DESCONOCIDO" };
  }
  const coincidencias = (Array.isArray(ocurrencias) ? ocurrencias : []).filter(
    (o: { start_time?: string; occurrence_id?: unknown; status?: string }) =>
      o && o.status !== "deleted" && Date.parse(o.start_time ?? "") === inicio.getTime()
  );
  const id = coincidencias.length === 1 ? coincidencias[0]?.occurrence_id : null;
  return typeof id === "string" && id
    ? { tipo: "ENCUENTRO", occurrenceId: id }
    : { tipo: "SERIE" };
}

export async function consultarInscriptosZoom({
  token,
  meetingId,
  habilitada,
  ambito
}: Readonly<{
  token: string | null;
  meetingId: string | null;
  habilitada: boolean | null;
  ambito: AmbitoInscriptos;
}>): Promise<ResultadoInscriptosZoom> {
  if (habilitada === false) {
    return { estado: "NO_HABILITADA", ambito, personas: [] };
  }
  if (!token || !meetingId || habilitada !== true || ambito.tipo === "DESCONOCIDO") {
    return { estado: "SIN_VERIFICAR", ambito, personas: [] };
  }
  const personas: InscriptoZoom[] = [];
  let incompleto = false;
  for (const estado of ["approved", "pending", "denied"] as const) {
    let next = "";
    const vistos = new Set<string>();
    for (let pagina = 0; pagina < 20; pagina++) {
      try {
        const params = new URLSearchParams({ status: estado, page_size: "100" });
        if (ambito.occurrenceId) {
          params.set("occurrence_id", ambito.occurrenceId);
        }
        if (next) {
          params.set("next_page_token", next);
        }
        const url = "https://api.zoom.us/v2/meetings/" + encodeURIComponent(meetingId) + "/registrants?" + params;
        const respuesta = await fetch(url, {
          headers: { Authorization: "Bearer " + token },
          cache: "no-store",
          signal: AbortSignal.timeout(5000)
        });
        if (!respuesta.ok) {
          incompleto = true;
          break;
        }
        const data = (await respuesta.json()) as {
          registrants?: Array<{ id?: string; first_name?: string; last_name?: string; email?: string; create_time?: string }>;
          next_page_token?: string;
        };
        for (const r of data.registrants ?? []) {
          if (!r.id || !r.email) {
            incompleto = true;
            continue;
          }
          personas.push({
            id: r.id,
            nombre: [r.first_name, r.last_name].filter(Boolean).join(" "),
            email: r.email,
            estado,
            fecha: r.create_time ?? null
          });
        }
        next = data.next_page_token ?? "";
        if (!next) {
          break;
        }
        if (vistos.has(next) || pagina === 19) {
          incompleto = true;
          break;
        }
        vistos.add(next);
      } catch {
        incompleto = true;
        break;
      }
    }
  }
  let estado: ResultadoInscriptosZoom["estado"] = "DISPONIBLE";
  if (incompleto) {
    estado = personas.length ? "PARCIAL" : "SIN_VERIFICAR";
  }
  return { estado, ambito, personas };
}
