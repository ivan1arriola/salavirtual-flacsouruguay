import { db } from "../src/lib/db";
import { actualizarEncuentro } from "../src/modules/reuniones/gestionar-encuentros.service";
import { modalidadEfectivaEncuentro } from "../src/modules/reuniones/encuentros.domain";
import { auditarEncuentro } from "../src/modules/reuniones/encuentros-persistence.adapter";

/**
 * Fuerza la modalidad de todos los encuentros no cancelados de una serie.
 * Usa la misma acción administrativa que la pantalla (CAMBIAR_MODALIDAD):
 * valida el horario de asistencia técnica, recalcula la tarifa del asistente
 * asignado y deja registro de auditoría.
 *
 * Uso: tsx scripts/forzar-modalidad-serie.ts <solicitudId> [--modalidad HIBRIDA|VIRTUAL]
 *        [--actor <usuarioId>] [--sin-validar] [--apply]
 * --sin-validar escribe el override directamente, sin validar el monitoreo ni recalcular tarifas.
 * Sin --apply solo informa.
 */
type Modalidad = "HIBRIDA" | "VIRTUAL";

function argumento(nombre: string): string | undefined {
  const indice = process.argv.indexOf(nombre);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}

/** Primer argumento posicional: el que no es una opción ni el valor de --modalidad / --actor. */
function idSolicitud(): string | undefined {
  return process.argv
    .slice(2)
    .find(
      (valor, indice, todos) =>
        !valor.startsWith("--") && !["--modalidad", "--actor"].includes(todos[indice - 1] ?? ""),
    );
}

type InstanciaForzada = Readonly<{ id: string; modalidadOverride: Modalidad | null }>;

/** Omite la validación del horario de monitoreo y no recalcula la tarifa; queda auditada con sinValidar=true. */
async function escrituraDirecta(
  actorId: string,
  instancia: InstanciaForzada,
  modalidad: Modalidad,
) {
  await db.$transaction(async (tx) => {
    await tx.instanciaSala.update({
      where: { id: instancia.id },
      data: { modalidadOverride: modalidad },
    });
    await auditarEncuentro(
      tx,
      actorId,
      "MODALIDAD_ENCUENTRO_CAMBIADA",
      instancia.id,
      { modalidadOverride: instancia.modalidadOverride },
      { modalidadOverride: modalidad, sinValidar: true },
    );
  });
}

async function buscarAdministrador(actorId: string | undefined) {
  const usuario = await db.usuario.findFirst({
    where: actorId ? { id: actorId } : { rol: "ADMINISTRACION", activo: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, rol: true, activo: true },
  });
  if (!usuario || usuario.rol !== "ADMINISTRACION" || !usuario.activo) {
    throw new Error("Se necesita un usuario de Administración activo (use --actor).");
  }
  return usuario;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const sinValidar = process.argv.includes("--sin-validar");
  const modalidad = (argumento("--modalidad") ?? "HIBRIDA") as Modalidad;
  const solicitudId = idSolicitud();
  if (!solicitudId) {
    throw new Error("Falta el id de la solicitud (serie).");
  }
  if (modalidad !== "HIBRIDA" && modalidad !== "VIRTUAL") {
    throw new Error("La modalidad debe ser HIBRIDA o VIRTUAL.");
  }

  const solicitud = await db.solicitudSala.findUnique({
    where: { id: solicitudId },
    select: {
      id: true,
      titulo: true,
      modalidad: true,
      instancias: {
        where: { estado: { not: "CANCELADA" } },
        orderBy: { inicioProgramadoAt: "asc" },
        select: {
          id: true,
          ordinal: true,
          estado: true,
          inicioProgramadoAt: true,
          modalidadOverride: true,
          requiereAsistenciaTecnica: true,
          inicioAsistenciaTecnicaAt: true,
          finAsistenciaTecnicaAt: true,
        },
      },
    },
  });
  if (!solicitud) {
    throw new Error(`No existe la solicitud ${solicitudId}.`);
  }

  console.log(`Serie: ${solicitud.titulo} (${solicitud.id})`);
  console.log(`Modalidad de la serie: ${solicitud.modalidad}. Objetivo: ${modalidad}.`);

  const filas = solicitud.instancias.map((instancia) => ({
    instancia,
    efectiva: modalidadEfectivaEncuentro(solicitud.modalidad, instancia.modalidadOverride),
  }));
  for (const { instancia, efectiva } of filas) {
    console.log(
      `#${instancia.ordinal} ${instancia.inicioProgramadoAt.toISOString()} ${instancia.estado} ` +
        `override=${instancia.modalidadOverride ?? "-"} efectiva=${efectiva}` +
        `${efectiva === modalidad ? " (ya correcta)" : ""}`,
    );
  }

  const pendientes = filas.filter(({ efectiva }) => efectiva !== modalidad);
  console.log(`${pendientes.length} de ${filas.length} encuentros por cambiar.`);
  if (!apply) {
    console.log("Simulación: no se escribió nada. Use --apply para aplicar.");
    return;
  }
  if (pendientes.length === 0) {
    return;
  }

  const usuario = await buscarAdministrador(argumento("--actor"));
  console.log(`Actor: ${usuario.id}`);

  let cambiados = 0;
  const fallidos: string[] = [];
  for (const { instancia } of pendientes) {
    try {
      if (sinValidar) {
        // Escritura directa: omite la validación del horario de monitoreo y no
        // recalcula la tarifa del asistente. Queda auditada con sinValidar=true.
        await escrituraDirecta(usuario.id, instancia, modalidad);
      } else {
        await actualizarEncuentro({ db }, usuario, solicitud.id, instancia.id, {
          accion: "CAMBIAR_MODALIDAD",
          modalidad,
        });
      }
      cambiados += 1;
      console.log(`OK #${instancia.ordinal}`);
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error);
      fallidos.push(`#${instancia.ordinal}: ${motivo}`);
      console.log(`FALLÓ #${instancia.ordinal}: ${motivo}`);
    }
  }
  console.log(`Cambiados: ${cambiados}. Fallidos: ${fallidos.length}.`);
  if (fallidos.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
