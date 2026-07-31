import { source } from "./clients";

export async function cargarOrigen() {
  return Promise.all([
    source.programa.findMany({ orderBy: [{ nombre: "asc" }, { id: "asc" }] }),
    source.cuentaZoom.findMany({ orderBy: [{ prioridad: "asc" }, { id: "asc" }] }),
    source.solicitudSala.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        docente: {
          select: { usuarioId: true }
        },
        createdBy: {
          select: { id: true }
        },
        eventos: {
          orderBy: [{ inicioProgramadoAt: "asc" }, { id: "asc" }],
          include: {
            asignaciones: {
              include: {
                asistente: {
                  select: { usuarioId: true }
                }
              }
            }
          }
        }
      }
    })
  ]);
}

export type ProgramaLegacy = Awaited<ReturnType<typeof cargarOrigen>>[0][number];
export type CuentaLegacy = Awaited<ReturnType<typeof cargarOrigen>>[1][number];
export type SolicitudLegacy = Awaited<ReturnType<typeof cargarOrigen>>[2][number];
