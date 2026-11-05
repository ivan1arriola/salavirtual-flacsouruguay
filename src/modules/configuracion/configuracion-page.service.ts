import type { PrismaClient } from "@prisma/client";
import { esCuentaAsignable } from "../reuniones/cuenta-asignable.domain";
import { obtenerCredencialPrincipalGoogleWorkspace } from "./google-workspace.service";
import { contarReunionesFuturasZoom } from "./zoom-grupo-sincronizacion.service";

export type OperacionPendienteItem = Readonly<{
  id: string;
  solicitudId: string;
  solicitudTitulo: string;
  programaNombre: string | null;
  docenteNombre: string | null;
  ordinal: number;
  inicioProgramadoAt: string;
  finProgramadoAt: string;
  estadoInstancia: string;
  hostEmail: string | null;
  hostNombre: string | null;
  externalEventId: string | null;
  joinUrl: string | null;
  codigoReunion: string | null;
  operacionPendiente: "PROVISIONAR" | "REPROGRAMAR" | "CONFIGURAR_MEET" | "CANCELAR" | null;
  estadoIntegracion: string;
  errorIntegracion: string | null;
  updatedAt: string;
}>;

export async function obtenerDatosPaginaConfiguracion(
  db: PrismaClient,
  section: string,
  ahora: Date = new Date()
) {
  const [
    configuration,
    assistantConfiguration,
    accounts,
    programCount,
    activeProgramCount,
    pendingMeetOperations,
    futureMeetingsByAccount,
    zoomGrupo
  ] = await Promise.all([
    obtenerCredencialPrincipalGoogleWorkspace(db, (k) => k, { requireActiva: false }),
    db.configuracionAsistenciaTecnica.findUnique({ where: { id: "principal" } }),
    db.cuentaProveedor.findMany({
      where: { proveedor: { tipo: { in: ["GOOGLE_MEET", "ZOOM"] } } },
      orderBy: [{ prioridad: "asc" }, { id: "asc" }],
      select: {
        id: true,
        nombre: true,
        emailOrganizador: true,
        prioridad: true,
        limiteConcurrente: true,
        tieneLicencia: true,
        activa: true,
        secretRef: true,
        origenGrupoZoom: true,
        fueraDelGrupoAt: true,
        proveedor: { select: { tipo: true, nombre: true } },
        _count: { select: { eventosProveedor: true } }
      }
    }),
    db.programa.count(),
    db.programa.count({ where: { activo: true } }),
    db.eventoProveedor.findMany({
      where: {
        proveedor: { tipo: "GOOGLE_MEET" },
        OR: [
          { operacionPendiente: { not: null } },
          { estadoIntegracion: "ERROR" }
        ]
      },
      orderBy: [{ instancia: { inicioProgramadoAt: "asc" } }],
      select: {
        id: true,
        estadoIntegracion: true,
        operacionPendiente: true,
        errorIntegracion: true,
        joinUrl: true,
        codigoReunion: true,
        externalEventId: true,
        updatedAt: true,
        cuentaProveedor: {
          select: {
            id: true,
            nombre: true,
            emailOrganizador: true
          }
        },
        instancia: {
          select: {
            id: true,
            ordinal: true,
            inicioProgramadoAt: true,
            finProgramadoAt: true,
            estado: true,
            solicitudSalaId: true,
            solicitud: {
              select: {
                id: true,
                titulo: true,
                docentePrograma: {
                  select: {
                    programa: { select: { id: true, nombre: true } },
                    docente: { select: { usuario: { select: { nombres: true, apellidos: true } } } }
                  }
                }
              }
            }
          }
        }
      }
    }),
    section === "salas" ? contarReunionesFuturasZoom(db, ahora) : Promise.resolve<Record<string, number>>({}),
    section === "salas"
      ? db.configuracionZoom.findUnique({
          where: { id: "principal" },
          select: { grupoId: true, grupoNombre: true, ultimaSincronizacionAt: true, ultimaSincronizacionResultado: true }
        })
      : Promise.resolve(null)
  ]);

  const hosts = accounts.map((account) => ({ ...account, reunionesFuturas: futureMeetingsByAccount[account.id] ?? 0 }));

  const [programs, teachers, academicUnits] = section === "programas"
    ? await Promise.all([
        db.programa.findMany({
          orderBy: { nombre: "asc" },
          select: {
            id: true,
            nombre: true,
            codigo: true,
            activo: true,
            unidadAcademicaId: true,
            unidadAcademica: { select: { id: true, nombre: true, activa: true } },
            docentes: {
              where: { activo: true },
              select: {
                docente: {
                  select: {
                    usuario: {
                      select: { id: true, nombres: true, apellidos: true, emailPrincipal: true, activo: true }
                    }
                  }
                }
              }
            }
          }
        }),
        db.usuario.findMany({
          where: { rol: "DOCENTE", activo: true },
          orderBy: [{ apellidos: "asc" }, { nombres: "asc" }],
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            emailPrincipal: true,
            activo: true
          }
        }),
        db.unidadAcademica.findMany({
          orderBy: { nombre: "asc" },
          select: { id: true, nombre: true, activa: true }
        })
      ])
    : [[], [], []];

  const adminReportRecipients = section === "asistencia"
    ? await db.usuario.findMany({
        where: { rol: "ADMINISTRACION", activo: true, emailPrincipal: { not: null } },
        orderBy: [{ apellidos: "asc" }, { nombres: "asc" }],
        select: { emailPrincipal: true }
      })
    : [];

  const historicalMeetings = section === "historico"
    ? await db.eventoProveedor.findMany({
        where: { proveedor: { tipo: "ZOOM_HISTORICO" } },
        orderBy: { instancia: { inicioProgramadoAt: "desc" } },
        take: 100,
        include: {
          cuentaProveedor: true,
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
      })
    : [];

  const availableHosts = hosts.filter(esCuentaAsignable).length;

  const pendingOperationItems: OperacionPendienteItem[] = pendingMeetOperations.map((ep) => ({
    id: ep.id,
    solicitudId: ep.instancia.solicitudSalaId,
    solicitudTitulo: ep.instancia.solicitud.titulo,
    programaNombre: ep.instancia.solicitud.docentePrograma?.programa?.nombre ?? null,
    docenteNombre: ep.instancia.solicitud.docentePrograma?.docente?.usuario
      ? `${ep.instancia.solicitud.docentePrograma.docente.usuario.nombres} ${ep.instancia.solicitud.docentePrograma.docente.usuario.apellidos}`
      : null,
    ordinal: ep.instancia.ordinal,
    inicioProgramadoAt: ep.instancia.inicioProgramadoAt.toISOString(),
    finProgramadoAt: ep.instancia.finProgramadoAt.toISOString(),
    estadoInstancia: ep.instancia.estado,
    hostEmail: ep.cuentaProveedor?.emailOrganizador ?? null,
    hostNombre: ep.cuentaProveedor?.nombre ?? null,
    externalEventId: ep.externalEventId,
    joinUrl: ep.joinUrl,
    codigoReunion: ep.codigoReunion,
    operacionPendiente: ep.operacionPendiente as "PROVISIONAR" | "REPROGRAMAR" | "CONFIGURAR_MEET" | "CANCELAR" | null,
    estadoIntegracion: ep.estadoIntegracion,
    errorIntegracion: ep.errorIntegracion,
    updatedAt: ep.updatedAt.toISOString()
  }));

  return {
    configuration,
    assistantConfiguration,
    hosts,
    programCount,
    activeProgramCount,
    pendingMeetOperations,
    programs,
    teachers,
    academicUnits,
    adminReportRecipients,
    historicalMeetings,
    availableHosts,
    pendingOperationItems,
    zoomGrupo
  };
}

