import {
  construirCorreoReporteMensual,
  periodoMesAnteriorUtc3
} from "../domain";
import type { LiquidacionesRepositoryPort } from "../ports";

export type ResultadoReportesMensuales = Readonly<{
  periodo: string;
  asistentes: number;
  enviados: number;
  yaProcesados: number;
  errores: number;
  sinCorreo: number;
}>;

export type EnviarReportesMensualesDeps = Readonly<{
  liquidacionesRepo: LiquidacionesRepositoryPort;
  enviarCorreo: (input: Readonly<{
    to: readonly string[];
    cc: readonly string[];
    subject: string;
    text: string;
    html: string;
  }>) => Promise<Readonly<{ sent: boolean; skipped?: string }>>;
}>;

export async function enviarReportesMensualesUseCase(
  deps: EnviarReportesMensualesDeps,
  ahora = new Date()
): Promise<ResultadoReportesMensuales> {
  const periodo = periodoMesAnteriorUtc3(ahora);
  const [candidatos, copiasBase] = await Promise.all([
    deps.liquidacionesRepo.obtenerCandidatosReporteMensual(periodo, ahora),
    deps.liquidacionesRepo.obtenerCopiasAdministracion()
  ]);

  let asistentes = 0;
  let enviados = 0;
  let yaProcesados = 0;
  let errores = 0;
  let sinCorreo = 0;

  for (const candidato of candidatos) {
    asistentes += 1;
    const destinatario = candidato.destinatario?.trim().toLowerCase();
    if (!destinatario) {
      sinCorreo += 1;
      continue;
    }

    const copias = copiasBase.filter((email) => email !== destinatario);
    const reserva = await deps.liquidacionesRepo.reservarEnvioReporte({
      asistenteTecnicoId: candidato.asistenteTecnicoId,
      periodo: periodo.clave,
      destinatario,
      copias,
      resumen: candidato.resumen
    });

    if (!reserva) {
      yaProcesados += 1;
      continue;
    }

    try {
      const correo = construirCorreoReporteMensual({
        nombre: candidato.nombre || "asistente",
        periodo: periodo.clave,
        resumen: candidato.resumen
      });

      const resultado = await deps.enviarCorreo({
        to: [destinatario],
        cc: copias,
        ...correo
      });

      if (!resultado.sent) {
        throw new Error(resultado.skipped ?? "No se pudo enviar el correo.");
      }

      await deps.liquidacionesRepo.marcarEnvioReporteExitoso(reserva.id, new Date());
      enviados += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido al enviar el reporte.";
      await deps.liquidacionesRepo.marcarEnvioReporteError(reserva.id, message.slice(0, 1000));
      errores += 1;
    }
  }

  return {
    periodo: periodo.clave,
    asistentes,
    enviados,
    yaProcesados,
    errores,
    sinCorreo
  };
}
