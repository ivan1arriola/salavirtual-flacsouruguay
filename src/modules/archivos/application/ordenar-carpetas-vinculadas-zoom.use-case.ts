import { nombreCarpetaReunion } from "../domain/meet-artifacts.domain";
import type { HashZoom } from "../domain";
import type { ArchivoStoragePort } from "../ports";

const ZONA_NEGOCIO = "America/Montevideo";

export type OcurrenciaCarpetaZoom = Readonly<{
  ocurrenciaId: string;
  driveFolderId: string;
  inicioRealAt: Date;
  /** Título del encuentro (el de la solicitud cuando está vinculada; si no, el tema de Zoom). */
  titulo: string;
}>;

export type RepoOrdenarCarpetasZoom = Readonly<{
  /** Ocurrencias vinculadas con carpeta de Drive cuyo orden todavía no se verificó. */
  listarPendientes(limite: number): Promise<readonly OcurrenciaCarpetaZoom[]>;
  /** Todas las vinculadas con carpeta cuyo inicio cae a ±36 h de `referencia` (candidatas a compartir encuentro). */
  listarVinculadasCercanas(referencia: Date): Promise<readonly OcurrenciaCarpetaZoom[]>;
  marcarCarpetaVinculada(ocurrenciaId: string, ahora: Date): Promise<boolean>;
}>;

export type ResumenOrdenarCarpetasZoom = Readonly<{
  ordenadas: number;
  noEncontradas: number;
  fallidas: number;
  /** No hay carpeta raíz de grabaciones vinculadas: no existe un destino seguro y no se toca nada. */
  sinRaiz: boolean;
}>;

function nombreEncuentro(o: Pick<OcurrenciaCarpetaZoom, "titulo" | "inicioRealAt">): string {
  return nombreCarpetaReunion({ titulo: o.titulo, inicio: o.inicioRealAt, timezone: ZONA_NEGOCIO });
}

type Dependencias = Readonly<{
  repo: RepoOrdenarCarpetasZoom;
  storage: Pick<ArchivoStoragePort, "asegurarCarpeta" | "moverCarpeta" | "renombrarCarpeta">;
  hash: HashZoom;
  raizVinculados: string | null;
  ahora: () => Date;
}>;

/** Ocurrencias del mismo encuentro (misma fecha local y tema) en orden cronológico, incluida la pendiente. */
async function miembrosDelEncuentro(
  repo: RepoOrdenarCarpetasZoom,
  pendiente: OcurrenciaCarpetaZoom,
  nombre: string,
): Promise<OcurrenciaCarpetaZoom[]> {
  const miembros = (await repo.listarVinculadasCercanas(pendiente.inicioRealAt))
    .filter((o) => nombreEncuentro(o) === nombre)
    .sort(
      (a, b) =>
        a.inicioRealAt.getTime() - b.inicioRealAt.getTime() ||
        a.ocurrenciaId.localeCompare(b.ocurrenciaId),
    );
  return miembros.some((m) => m.ocurrenciaId === pendiente.ocurrenciaId)
    ? miembros
    : [...miembros, pendiente];
}

/** Renombra, agrupa y mueve las carpetas de un encuentro; devuelve cuántas quedaron ordenadas y cuántas no existen. */
async function ordenarEncuentro(
  deps: Dependencias,
  raiz: string,
  miembros: readonly OcurrenciaCarpetaZoom[],
  nombre: string,
  signal: AbortSignal | undefined,
): Promise<Readonly<{ ordenadas: number; noEncontradas: number }>> {
  // Primero se renombra todo: así ninguna carpeta de ocurrencia comparte nombre con la del encuentro
  // y `asegurarCarpeta` (que busca por nombre) no puede devolver una de ellas por error.
  const renombradas: string[] = [];
  for (const [i, m] of miembros.entries()) {
    const nuevo = miembros.length === 1 ? nombre : `Grabación ${i + 1}`;
    renombradas.push(await deps.storage.renombrarCarpeta(m.driveFolderId, nuevo, signal));
  }
  const destino =
    miembros.length === 1
      ? raiz
      : await deps.storage.asegurarCarpeta(
          deps.hash(`zoom-carpeta|encuentro|${raiz}|${nombre}`),
          nombre,
          raiz,
        );

  let ordenadas = 0;
  let noEncontradas = 0;
  for (const [i, m] of miembros.entries()) {
    const existe =
      renombradas[i] !== "NO_ENCONTRADO" &&
      (await deps.storage.moverCarpeta(m.driveFolderId, destino, signal)) !== "NO_ENCONTRADO";
    if (!existe) {
      noEncontradas++;
      continue;
    }
    await deps.repo.marcarCarpetaVinculada(m.ocurrenciaId, deps.ahora());
    ordenadas++;
  }
  return { ordenadas, noEncontradas };
}

/**
 * Deja las carpetas de grabaciones de encuentros vinculados como en Google Meet: directamente bajo la raíz,
 * con el nombre `AAAAMMDD - Tema`. Si un mismo encuentro (misma fecha local y tema) tiene varias grabaciones,
 * cada carpeta de ocurrencia pasa a `Grabación 1`, `Grabación 2`… (orden cronológico) dentro de `AAAAMMDD - Tema`.
 * Se mueven y renombran carpetas conservando sus IDs, así que los archivos y los enlaces ya compartidos siguen
 * valiendo. Es idempotente; un fallo en un encuentro no impide los demás y se reintenta en el próximo ciclo.
 */
export async function ordenarCarpetasVinculadasZoomUseCase(
  deps: Dependencias,
  opciones: Readonly<{ limite: number; signal?: AbortSignal }>,
): Promise<ResumenOrdenarCarpetasZoom> {
  if (!deps.raizVinculados) {
    return { ordenadas: 0, noEncontradas: 0, fallidas: 0, sinRaiz: true };
  }
  let ordenadas = 0;
  let noEncontradas = 0;
  let fallidas = 0;
  const resueltas = new Set<string>();

  for (const pendiente of await deps.repo.listarPendientes(opciones.limite)) {
    if (resueltas.has(pendiente.ocurrenciaId)) {
      continue;
    }
    try {
      const nombre = nombreEncuentro(pendiente);
      const miembros = await miembrosDelEncuentro(deps.repo, pendiente, nombre);
      miembros.forEach((m) => resueltas.add(m.ocurrenciaId));
      const r = await ordenarEncuentro(
        deps,
        deps.raizVinculados,
        miembros,
        nombre,
        opciones.signal,
      );
      ordenadas += r.ordenadas;
      noEncontradas += r.noEncontradas;
    } catch {
      // Sin detalle: el mensaje podría traer URLs. Quedan sin marcar y se reintentan en el próximo ciclo.
      fallidas++;
    }
  }
  return { ordenadas, noEncontradas, fallidas, sinRaiz: false };
}
