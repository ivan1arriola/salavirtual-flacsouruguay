import type { Prisma, PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { TIPOS_ARTEFACTO_SINCRONIZABLES } from "./meet-artifacts.domain";
import { obtenerAlcanceGrabaciones } from "./grabaciones.domain";

export function listarArchivosMeetVisibles(
  db: PrismaClient,
  actor: SessionActor
) {
  return db.archivoReunion.findMany({
    where: {
      tipo: { in: [...TIPOS_ARTEFACTO_SINCRONIZABLES] },
      eventoProveedor: { instancia: alcanceInstancias(actor) }
    },
    orderBy: [{ capturadoAt: "desc" }, { createdAt: "desc" }],
    take: 300,
    include: {
      eventoProveedor: {
        include: {
          instancia: {
            include: {
              solicitud: {
                include: {
                  docentePrograma: {
                    include: {
                      programa: true,
                      docente: { include: { usuario: true } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });
}

export function listarGrabacionesPendientesVisibles(
  db: PrismaClient,
  actor: SessionActor,
  desde: Date,
  hasta: Date
) {
  return db.eventoProveedor.findMany({
    where: {
      proveedor: { tipo: "GOOGLE_MEET" },
      codigoReunion: { not: null },
      archivosSincronizadosAt: null,
      archivos: { none: { tipo: "GRABACION" } },
      instancia: {
        ...alcanceInstancias(actor),
        requiereGrabacion: true,
        estado: { not: "CANCELADA" },
        finProgramadoAt: { gte: desde, lte: hasta }
      }
    },
    orderBy: { instancia: { inicioProgramadoAt: "desc" } },
    take: 100,
    include: {
      instancia: {
        include: {
          solicitud: {
            include: {
              docentePrograma: {
                include: {
                  programa: true,
                  docente: { include: { usuario: true } }
                }
              }
            }
          }
        }
      }
    }
  });
}

export function listarGrabacionesNoRealizadasVisibles(
  db: PrismaClient,
  actor: SessionActor,
  desde: Date,
  hasta: Date
) {
  return db.eventoProveedor.findMany({
    where: {
      proveedor: { tipo: "GOOGLE_MEET" },
      codigoReunion: { not: null },
      archivosSincronizadosAt: { not: null },
      errorArchivos: null,
      archivos: { none: { tipo: "GRABACION" } },
      instancia: {
        ...alcanceInstancias(actor),
        requiereGrabacion: true,
        estado: { not: "CANCELADA" },
        finProgramadoAt: { gte: desde, lte: hasta }
      }
    },
    orderBy: { instancia: { inicioProgramadoAt: "desc" } },
    take: 100,
    include: {
      instancia: {
        include: {
          solicitud: {
            include: {
              docentePrograma: {
                include: {
                  programa: true,
                  docente: { include: { usuario: true } }
                }
              }
            }
          }
        }
      }
    }
  });
}

function alcanceInstancias(actor: SessionActor): Prisma.InstanciaSalaWhereInput {
  const scope = obtenerAlcanceGrabaciones(actor.rol);
  if (scope === "COMPLETO") return {};
  if (scope === "PROGRAMAS_DOCENTE") {
    return {
      solicitud: {
        docentePrograma: {
          programa: {
            docentes: {
              some: { activo: true, docente: { usuarioId: actor.id } }
            }
          }
        }
      }
    };
  }
  return {
    asignaciones: {
      some: {
        asistenteTecnico: { usuarioId: actor.id },
        estado: { in: ["ASIGNADO", "ACEPTADO"] }
      }
    }
  };
}
