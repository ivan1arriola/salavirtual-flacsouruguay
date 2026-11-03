import type { PrismaClient } from "@prisma/client";
import { seleccionarEventoProveedorActivo } from "./evento-proveedor-activo.domain";
import { MARGEN_SEGURIDAD_HORAS_APLICAR } from "./migracion-zoom-aplicar.service";
import {
  meetPreparadoParaMigracion,
  planificarMigracionZoomPorSerie,
  type EncuentroSerieMigracionZoom,
  type EstadoVistaPreviaZoom,
  type SerieMigracionZoom,
} from "./migracion-zoom-preview.domain";
import { cargarDatosMigracionZoom, exigirAdministracion } from "./migracion-zoom.service";
import { claveSerieReunion } from "./serie-reunion.domain";

type Actor = Readonly<{ id: string; rol: string }>;

export type EncuentroVistaPreviaSerie = Readonly<{
  id: string;
  inicio: string;
  fin: string;
  proveedor: "GOOGLE_MEET" | "ZOOM";
  enlaceActual: string | null;
  /** Se convertirá a Zoom: es un encuentro futuro que hoy está en Meet. */
  migra: boolean;
  conservarEnMeet: boolean;
  motivoExcepcion: string | null;
}>;

export type FilaVistaPreviaSerie = Readonly<{
  serieClave: string;
  titulo: string;
  programa: string;
  estado: EstadoVistaPreviaZoom;
  hostZoom: Readonly<{ id: string; nombre: string; email: string | null }> | null;
  encuentros: readonly EncuentroVistaPreviaSerie[];
  cambioEnlace: boolean;
  destinatarios: readonly string[];
}>;

export type VistaPreviaMigracionZoomSerie = Readonly<{
  modo: "SERIE";
  generadaAt: string;
  margenSeguridadHoras: number;
  conteos: Readonly<Record<EstadoVistaPreviaZoom, number>>;
  filas: readonly FilaVistaPreviaSerie[];
}>;

/**
 * Propuesta de migración por serie: la unidad es la serie completa (un solo anfitrión Zoom con sala
 * libre en todos los horarios y una sola reunión compartida). No realiza ninguna escritura.
 */
export async function obtenerVistaPreviaMigracionZoomPorSerie(
  db: PrismaClient,
  actor: Actor,
  ahora: Date = new Date(),
): Promise<VistaPreviaMigracionZoomSerie> {
  exigirAdministracion(actor);
  const { instancias, hosts, reservas } = await cargarDatosMigracionZoom(db, ahora);
  const hostPorId = new Map(hosts.map((host) => [host.id, host]));

  const porSerie = instancias.reduce<ReadonlyMap<string, readonly (typeof instancias)[number][]>>(
    (mapa, instancia) => {
      const clave = claveSerieReunion(instancia.solicitud);
      return new Map([...mapa, [clave, [...(mapa.get(clave) ?? []), instancia]]]);
    },
    new Map(),
  );

  const series: SerieMigracionZoom[] = [...porSerie].map(([serieClave, delaSerie]) => {
    const encuentros = delaSerie.map((instancia): EncuentroSerieMigracionZoom => {
      const activo = seleccionarEventoProveedorActivo(instancia)?.proveedor.tipo;
      const meet = instancia.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
      const zoom = instancia.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "ZOOM");
      return {
        id: instancia.id,
        inicio: instancia.inicioProgramadoAt,
        fin: instancia.finProgramadoAt,
        estado: instancia.estado,
        proveedorActivo: activo === "GOOGLE_MEET" || activo === "ZOOM" ? activo : null,
        conservarGoogleMeet: instancia.conservarGoogleMeet,
        meetPreparado: meetPreparadoParaMigracion(meet ? {
          ...meet,
          emailOrganizador: meet.cuentaProveedor?.emailOrganizador ?? null,
        } : null),
        meetJoinUrl: meet?.joinUrl ?? null,
        zoomSincronizado: zoom?.estadoIntegracion === "SINCRONIZADA",
        reunionCompartidaId: zoom?.reunionProveedorId ?? null,
      };
    });

    // Sala preferida: la de la reunión compartida si ya hay encuentros en Zoom; si no, la que
    // corresponde al organizador Meet del primer encuentro.
    const primeroEnZoom = delaSerie
      .flatMap(({ eventosProveedor, proveedorActivoTipo }) =>
        proveedorActivoTipo === "ZOOM"
          ? eventosProveedor.filter(({ proveedor, reunionProveedorId }) => proveedor.tipo === "ZOOM" && reunionProveedorId)
          : [])[0];
    const emailMeet = delaSerie
      .flatMap(({ eventosProveedor }) => eventosProveedor)
      .find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET")
      ?.cuentaProveedor?.emailOrganizador?.trim().toLowerCase();
    const cuentaZoomPreferidaId = primeroEnZoom?.cuentaProveedorId
      ?? (emailMeet
        ? hosts.find((host) => host.emailOrganizador?.trim().toLowerCase() === emailMeet)?.id ?? null
        : null);
    return { serieClave, encuentros, cuentaZoomPreferidaId };
  });

  const plan = planificarMigracionZoomPorSerie({
    ahora,
    margenSeguridadHoras: MARGEN_SEGURIDAD_HORAS_APLICAR,
    series,
    hosts: hosts.map((host) => ({ ...host, limiteConcurrente: 1 })),
    reservasZoom: reservas.flatMap(({ cuentaProveedorId, instanciaSalaId, instancia }) =>
      cuentaProveedorId
        ? [{ cuentaProveedorId, inicio: instancia.inicioProgramadoAt, fin: instancia.finProgramadoAt, instanciaId: instanciaSalaId }]
        : []),
  });

  const conteos: Record<EstadoVistaPreviaZoom, number> = {
    MIGRABLE: 0, EXCEPCION: 0, SERIE: 0, YA_ZOOM: 0, SIN_SALA: 0, CERCANO: 0, NO_FUTURO: 0, REVISAR: 0,
  };
  const filas = plan.map((fila): FilaVistaPreviaSerie => {
    conteos[fila.estado] += 1;
    const delaSerie = [...(porSerie.get(fila.serieClave) ?? [])]
      .sort((a, b) => a.inicioProgramadoAt.getTime() - b.inicioProgramadoAt.getTime());
    const aMigrar = new Set(fila.encuentroIds);
    const primera = delaSerie[0];
    const host = fila.hostId ? hostPorId.get(fila.hostId) : undefined;
    const correos = new Set<string>();
    if (fila.estado === "MIGRABLE") {
      for (const instancia of delaSerie.filter(({ id }) => aMigrar.has(id))) {
        for (const email of [
          instancia.solicitud.docentePrograma.docente.usuario.emailPrincipal,
          instancia.solicitud.creadaPor.emailPrincipal,
          ...instancia.asignaciones.map(({ asistenteTecnico }) => asistenteTecnico.usuario.emailPrincipal),
          ...instancia.cohostEmails.map(({ email: correo }) => correo),
          ...instancia.invitados.map(({ email: correo }) => correo),
        ]) {
          if (email) correos.add(email.toLowerCase());
        }
      }
    }
    return {
      serieClave: fila.serieClave,
      titulo: primera.solicitud.titulo,
      programa: primera.solicitud.docentePrograma.programa.nombre,
      estado: fila.estado,
      hostZoom: host ? { id: host.id, nombre: host.nombre, email: host.emailOrganizador } : null,
      encuentros: delaSerie.map((instancia): EncuentroVistaPreviaSerie => {
        const activo = seleccionarEventoProveedorActivo(instancia);
        return {
          id: instancia.id,
          inicio: instancia.inicioProgramadoAt.toISOString(),
          fin: instancia.finProgramadoAt.toISOString(),
          proveedor: activo?.proveedor.tipo === "ZOOM" ? "ZOOM" : "GOOGLE_MEET",
          enlaceActual: activo?.joinUrl ?? null,
          migra: aMigrar.has(instancia.id),
          conservarEnMeet: instancia.conservarGoogleMeet,
          motivoExcepcion: instancia.conservarGoogleMeet ? instancia.motivoConservarGoogleMeet : null,
        };
      }),
      cambioEnlace: fila.estado === "MIGRABLE",
      destinatarios: [...correos].sort(),
    };
  });

  return {
    modo: "SERIE",
    generadaAt: ahora.toISOString(),
    margenSeguridadHoras: MARGEN_SEGURIDAD_HORAS_APLICAR,
    conteos,
    filas,
  };
}
