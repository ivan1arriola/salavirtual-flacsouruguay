import type {
  RegistroAsistenciaPersonal,
  RegistroHistorialAsistenciaPersonal
} from "../domain";
import type { AsistenciaRepositoryPort } from "../ports";

export type ConsultarAsistenciasDeps = Readonly<{
  repo: AsistenciaRepositoryPort;
}>;

export async function consultarAsistenciasPersonalesUseCase(
  deps: ConsultarAsistenciasDeps,
  usuarioId: string,
  periodo: "MES_ACTUAL" | "HISTORICO",
  ahora = new Date()
): Promise<readonly RegistroAsistenciaPersonal[]> {
  return deps.repo.obtenerAsistenciasPersonales(usuarioId, periodo, ahora);
}

export async function consultarHistorialAsistenteUseCase(
  deps: ConsultarAsistenciasDeps,
  usuarioId: string,
  desde: Date,
  hasta: Date,
  limite = 500
): Promise<readonly RegistroHistorialAsistenciaPersonal[]> {
  return deps.repo.obtenerHistorialAsistenteEnRango(usuarioId, desde, hasta, limite);
}

export async function consultarSlugAsistenteUseCase(
  deps: ConsultarAsistenciasDeps,
  usuarioId: string
): Promise<string | null> {
  return deps.repo.obtenerSlugAsistente(usuarioId);
}
