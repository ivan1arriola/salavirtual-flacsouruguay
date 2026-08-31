import type { PrismaClient } from "@prisma/client";
import { enviarCorreoConfigurado } from "../configuracion/correo.service";
import { obtenerAsistenciasEnRango } from "./resumen-personal.adapter";
import { resumirAsistencias } from "./resumen-personal.domain";
import {
  construirCorreoReporteMensual,
  minutosTotales,
  periodoMesAnteriorUtc3
} from "./reporte-mensual.domain";

export type ResultadoReportesMensuales = Readonly<{
  periodo: string;
  asistentes: number;
  enviados: number;
  yaProcesados: number;
  errores: number;
  sinCorreo: number;
}>;

export async function enviarReportesMensualesAsistencia(
  db: PrismaClient,
  ahora = new Date()
): Promise<ResultadoReportesMensuales> {
  const periodo = periodoMesAnteriorUtc3(ahora);
  const [asistentes, administradores, configuracion] = await Promise.all([
    db.asistenteTecnico.findMany({
      where: { usuario: { emailPrincipal: { not: null } } },
      orderBy: { usuario: { nombres: "asc" } },
      select: {
        id: true,
        usuarioId: true,
        usuario: { select: { nombres: true, apellidos: true, emailPrincipal: true } }
      }
    }),
    db.usuario.findMany({
      where: { rol: "ADMINISTRACION", activo: true, emailPrincipal: { not: null } },
      select: { emailPrincipal: true }
    }),
    db.configuracionAsistenciaTecnica.findUnique({
      where: { id: "principal" },
      select: { correosCopiaReporteMensual: true }
    })
  ]);

  const copiasBase = normalizarCorreos([
    ...administradores.flatMap(({ emailPrincipal }) => emailPrincipal ? [emailPrincipal] : []),
    ...(configuracion?.correosCopiaReporteMensual ?? [])
  ]);
  let enviados = 0;
  let yaProcesados = 0;
  let errores = 0;
  let sinCorreo = 0;

  for (const asistente of asistentes) {
    const destinatario = asistente.usuario.emailPrincipal?.trim().toLowerCase();
    if (!destinatario) {
      sinCorreo += 1;
      continue;
    }
    const registros = await obtenerAsistenciasEnRango(
      db,
      asistente.usuarioId,
      { desde: periodo.desde, hasta: periodo.hasta },
      ahora,
      "asc",
      1000
    );
    const resumen = resumirAsistencias(registros);
    const copias = copiasBase.filter((email) => email !== destinatario);
    const reserva = await reservarEnvio(db, {
      asistenteTecnicoId: asistente.id,
      periodo: periodo.clave,
      destinatario,
      copias,
      resumen
    });
    if (!reserva) {
      yaProcesados += 1;
      continue;
    }

    try {
      const nombre = `${asistente.usuario.nombres} ${asistente.usuario.apellidos ?? ""}`.trim();
      const correo = construirCorreoReporteMensual({
        nombre: nombre || "asistente",
        periodo: periodo.clave,
        resumen
      });
      const resultado = await enviarCorreoConfigurado(db, {
        to: [destinatario],
        cc: copias,
        ...correo
      });
      if (!resultado.sent) {
        throw new Error(resultado.skipped ?? "No se pudo enviar el correo.");
      }
      await db.envioReporteMensualAsistencia.update({
        where: { id: reserva.id },
        data: { estado: "ENVIADO", enviadoAt: new Date(), ultimoError: null }
      });
      enviados += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido al enviar el reporte.";
      await db.envioReporteMensualAsistencia.update({
        where: { id: reserva.id },
        data: { estado: "ERROR", ultimoError: message.slice(0, 1000) }
      });
      errores += 1;
    }
  }

  return {
    periodo: periodo.clave,
    asistentes: asistentes.length,
    enviados,
    yaProcesados,
    errores,
    sinCorreo
  };
}

async function reservarEnvio(
  db: PrismaClient,
  input: Readonly<{
    asistenteTecnicoId: string;
    periodo: string;
    destinatario: string;
    copias: readonly string[];
    resumen: ReturnType<typeof resumirAsistencias>;
  }>
): Promise<Readonly<{ id: string }> | null> {
  const where = {
    asistenteTecnicoId_periodo: {
      asistenteTecnicoId: input.asistenteTecnicoId,
      periodo: input.periodo
    }
  } as const;
  const existing = await db.envioReporteMensualAsistencia.findUnique({
    where,
    select: { id: true, estado: true }
  });
  const snapshot = {
    minutosTotal: minutosTotales(input.resumen),
    minutosVirtuales: input.resumen.minutosVirtuales,
    minutosHibridos: input.resumen.minutosHibridos,
    reuniones: input.resumen.reuniones,
    destinatario: input.destinatario,
    copias: [...input.copias]
  };

  if (existing) {
    if (existing.estado !== "ERROR") return null;
    const claimed = await db.envioReporteMensualAsistencia.updateMany({
      where: { id: existing.id, estado: "ERROR" },
      data: {
        estado: "PENDIENTE",
        intentos: { increment: 1 },
        ultimoError: null,
        ...snapshot
      }
    });
    return claimed.count === 1 ? { id: existing.id } : null;
  }

  try {
    return await db.envioReporteMensualAsistencia.create({
      data: {
        asistenteTecnicoId: input.asistenteTecnicoId,
        periodo: input.periodo,
        ...snapshot
      },
      select: { id: true }
    });
  } catch (error) {
    if (esErrorUnico(error)) return null;
    throw error;
  }
}

function normalizarCorreos(correos: readonly string[]): string[] {
  return [...new Set(correos.map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

function esErrorUnico(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
