import type { Prisma, PrismaClient } from "@prisma/client";
import { vincularAutomaticamenteSiInequivoco } from "./zoom-vinculo-automatico";
import {
  asignarNombresDestinoZoom,
  bytesTransferidosReservaAbandonadaZoom,
  estadoInicialArchivoZoom,
  estadoTrasReinventarioZoom,
  evaluarCupoTransferenciaZoom,
  multiplicidadesAmbiguasZoom,
  referenciaExternaArchivoZoom,
  sanearErrorZoom,
  tipoArchivoReunionZoom,
  type ArchivoOrigenZoom,
  type EstadoCalculadoArchivoZoom,
  type HashZoom,
  type LeaseArchivoZoom
} from "../../domain";
import type {
  ActorVinculoZoom,
  ArchivoReclamadoZoom,
  DestinoConservadoZoom,
  FalloArchivoZoom,
  OcurrenciaInventariadaZoom,
  ProgresoArchivoZoom,
  ResultadoDesvinculo,
  ResultadoReservaTransferenciaZoom,
  ResultadoVinculo,
  ResumenInventarioGuardado,
  SolicitudReservaTransferenciaZoom,
  ZoomArchivoRepositoryPort
} from "../../ports";

export type PrismaZoomArchivoRepositoryDeps = Readonly<{
  db: PrismaClient;
  /** Misma función de hash usada para las claves de origen; anonimiza la referencia externa. */
  hash: HashZoom;
  reloj?: () => Date;
}>;

type Tx = Prisma.TransactionClient;

const CANDIDATOS_POR_RONDA = 10;
const RONDAS_DE_RECLAMO = 3;
const CLAVE_BLOQUEO_CUPO = "flacso-zoom:cupo-transferencia";

function elegibleParaReclamo(ahora: Date): Prisma.ArchivoOrigenZoomWhereInput {
  return {
    OR: [
      {
        descargable: true,
        estado: { in: ["PENDIENTE", "ERROR_REINTENTABLE"] },
        OR: [{ proximoIntentoAt: null }, { proximoIntentoAt: { lte: ahora } }]
      },
      // Lease vencido: el worker anterior cayó o dejó de renovar. Se recupera aunque el último
      // inventario ya no ofrezca descarga, para que el fallo quede registrado y visible.
      { estado: "COPIANDO", OR: [{ leaseHasta: null }, { leaseHasta: { lt: ahora } }] }
    ]
  };
}

/** Una URI de sesión reanudable de Drive es una credencial: solo se persiste cifrada. */
function exigirSesionCifrada(valor: string | null | undefined): void {
  if (typeof valor === "string" && /^[a-z][a-z0-9+.-]*:\/\//i.test(valor.trim())) {
    throw new Error("La sesión de subida debe persistirse cifrada.");
  }
}

function leaseVigente(lease: LeaseArchivoZoom) {
  return { id: lease.archivoId, leaseVersion: lease.version, estado: "COPIANDO" as const };
}

function esUnicidadViolada(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

/**
 * Cierra las reservas abiertas de leases anteriores del archivo (intentos caídos) con los
 * bytes que Drive confirmó durante ese intento, para que un reclamo repetido nunca vuelva
 * a contar el tamaño completo: el nuevo intento reserva solo lo que falta.
 */
async function cerrarReservasDeLeasesAnteriores(
  cliente: Tx,
  archivoId: string,
  versionVigente: number,
  ahora: Date
): Promise<void> {
  const abiertas = await cliente.reservaTransferenciaZoom.findMany({
    where: { archivoOrigenId: archivoId, liberadoAt: null, leaseVersion: { lt: versionVigente } },
    select: { id: true, bytesConfirmadosInicio: true, archivoOrigen: { select: { bytesConfirmados: true } } }
  });
  for (const reserva of abiertas) {
    await cliente.reservaTransferenciaZoom.updateMany({
      where: { id: reserva.id, liberadoAt: null },
      data: {
        ajustadoBytes: bytesTransferidosReservaAbandonadaZoom(
          reserva.bytesConfirmadosInicio,
          reserva.archivoOrigen.bytesConfirmados
        ),
        liberadoAt: ahora
      }
    });
  }
}

/** Serializa operaciones de una ocurrencia (confirmación, vínculo, desvínculo). */
async function bloquearOcurrencia(tx: Tx, ocurrenciaId: string) {
  return tx.$queryRaw<{ id: string; eventoProveedorId: string | null }[]>`
    SELECT "id", "eventoProveedorId" FROM "OcurrenciaArchivoZoom" WHERE "id" = ${ocurrenciaId} FOR UPDATE`;
}

function metadatosRecurso(recurso: ArchivoOrigenZoom) {
  return {
    archivoZoomId: recurso.archivoZoomId,
    coleccion: recurso.coleccion,
    tipoOriginal: recurso.tipoOriginal,
    variante: recurso.variante,
    extension: recurso.extension,
    inicioAt: recurso.inicioAt,
    finAt: recurso.finAt,
    tamanoBytes: recurso.tamanoBytes,
    estadoOrigen: recurso.estadoOrigen,
    descargable: recurso.descargable
  };
}

const SELECCION_REFERENCIA = {
  id: true,
  claveOrigen: true,
  tipoOriginal: true,
  driveFileId: true,
  nombreDestino: true,
  bytesConfirmados: true,
  mimeType: true,
  webViewUrl: true,
  inicioAt: true
} as const;

type ArchivoParaReferencia = Prisma.ArchivoOrigenZoomGetPayload<{ select: typeof SELECCION_REFERENCIA }>;
type OcurrenciaParaReferencia = Readonly<{
  cuentaZoomId: string;
  uuid: string;
  inicioRealAt: Date;
  eventoProveedorId: string;
}>;

export function crearPrismaZoomArchivoRepositoryAdapter(
  deps: PrismaZoomArchivoRepositoryDeps
): ZoomArchivoRepositoryPort {
  const { db, hash } = deps;
  const reloj = deps.reloj ?? (() => new Date());

  /** Crea o actualiza el ArchivoReunion del archivo conservado; misma transacción que el llamador. */
  async function asegurarReferenciaLocal(
    tx: Tx,
    archivo: ArchivoParaReferencia,
    ocurrencia: OcurrenciaParaReferencia,
    nombre: string
  ): Promise<void> {
    if (!archivo.driveFileId) {
      return;
    }
    const externalResourceName = referenciaExternaArchivoZoom(
      ocurrencia.cuentaZoomId,
      ocurrencia.uuid,
      archivo.claveOrigen,
      hash
    );
    const datos = {
      tipo: tipoArchivoReunionZoom(archivo.tipoOriginal),
      driveFileId: archivo.driveFileId,
      nombre,
      mimeType: archivo.mimeType,
      tamanoBytes: archivo.bytesConfirmados,
      webViewUrl: archivo.webViewUrl,
      capturadoAt: archivo.inicioAt ?? ocurrencia.inicioRealAt
    };
    const referencia = await tx.archivoReunion.upsert({
      where: {
        eventoProveedorId_externalResourceName: {
          eventoProveedorId: ocurrencia.eventoProveedorId,
          externalResourceName
        }
      },
      create: { eventoProveedorId: ocurrencia.eventoProveedorId, externalResourceName, ...datos },
      update: datos,
      select: { id: true }
    });
    await tx.archivoOrigenZoom.update({
      where: { id: archivo.id },
      data: { archivoReunionId: referencia.id }
    });
  }

  return {
    async guardarInventario(
      entrada: OcurrenciaInventariadaZoom,
      inventario
    ): Promise<ResumenInventarioGuardado> {
      const ref = entrada.referencia;
      const ambiguos = multiplicidadesAmbiguasZoom(inventario.observaciones);
      // Defensivo: claves repetidas en la entrada nunca se fusionan en silencio.
      const porClave = new Map<string, { recurso: ArchivoOrigenZoom; multiplicidad: number }>();
      for (const recurso of inventario.recursos) {
        const previo = porClave.get(recurso.claveOrigen);
        porClave.set(recurso.claveOrigen, {
          recurso: previo?.recurso ?? recurso,
          multiplicidad: Math.max(
            ambiguos.get(recurso.claveOrigen) ?? 1,
            (previo ? previo.multiplicidad : 0) + 1
          )
        });
      }
      const observaciones = inventario.observaciones as unknown as Prisma.InputJsonValue;

      return db.$transaction(async (tx) => {
        // El upsert escribe siempre la fila: su bloqueo serializa inventarios concurrentes de la ocurrencia.
        const ocurrencia = await tx.ocurrenciaArchivoZoom.upsert({
          where: { cuentaZoomId_uuid: { cuentaZoomId: ref.cuentaZoomId, uuid: ref.uuid } },
          create: {
            cuentaZoomId: ref.cuentaZoomId,
            uuid: ref.uuid,
            meetingId: ref.meetingId,
            anfitrionZoomId: ref.anfitrionZoomId,
            cuentaProveedorId: entrada.cuentaProveedorId,
            inicioRealAt: ref.inicioRealAt,
            titulo: ref.titulo,
            inventariadoAt: entrada.inventariadoAt,
            proximoInventarioAt: entrada.proximoInventarioAt,
            procesamientoPendiente: inventario.procesamientoPendiente,
            observacionesInventario: observaciones
          },
          update: {
            meetingId: ref.meetingId,
            anfitrionZoomId: ref.anfitrionZoomId,
            titulo: ref.titulo,
            inventariadoAt: entrada.inventariadoAt,
            proximoInventarioAt: entrada.proximoInventarioAt,
            procesamientoPendiente: inventario.procesamientoPendiente,
            observacionesInventario: observaciones,
            ...(entrada.cuentaProveedorId ? { cuentaProveedorId: entrada.cuentaProveedorId } : {})
          },
          select: { id: true, eventoProveedorId: true }
        });
        // Coincidencia inequívoca (UUID exacto, o reunión + horario único): se vincula sola; todo lo demás queda para vínculo manual.
        await vincularAutomaticamenteSiInequivoco(tx, {
          ocurrenciaId: ocurrencia.id,
          uuid: ref.uuid,
          meetingId: ref.meetingId,
          inicioRealAt: ref.inicioRealAt,
          eventoProveedorId: ocurrencia.eventoProveedorId,
          ahora: entrada.inventariadoAt
        });

        const existentes = await tx.archivoOrigenZoom.findMany({
          where: { ocurrenciaId: ocurrencia.id },
          select: { id: true, claveOrigen: true, estado: true, nombreDestino: true }
        });
        const existentesPorClave = new Map(existentes.map((e) => [e.claveOrigen, e]));
        const nuevos = [...porClave.values()]
          .filter(({ recurso }) => !existentesPorClave.has(recurso.claveOrigen))
          .map(({ recurso }) => recurso);
        const nombres = asignarNombresDestinoZoom(
          ref,
          nuevos,
          existentes.map((e) => e.nombreDestino)
        );

        let creados = 0;
        let actualizados = 0;
        let requierenRevision = 0;
        for (const { recurso, multiplicidad } of porClave.values()) {
          const datos = {
            ...metadatosRecurso(recurso),
            multiplicidadObservada: multiplicidad,
            ultimaObservacionAt: entrada.inventariadoAt
          };
          const existente = existentesPorClave.get(recurso.claveOrigen);
          if (existente) {
            const transicion = estadoTrasReinventarioZoom(existente.estado, recurso, multiplicidad);
            // La transición solo aplica si nadie cambió el estado entretanto (p. ej. un claim).
            const aplicada = transicion
              ? (
                  await tx.archivoOrigenZoom.updateMany({
                    where: { id: existente.id, estado: existente.estado },
                    data: { ...datos, estado: transicion.estado, errorCodigo: transicion.errorCodigo }
                  })
                ).count === 1
              : false;
            if (!aplicada) {
              await tx.archivoOrigenZoom.update({ where: { id: existente.id }, data: datos });
            }
            actualizados++;
            if (aplicada && transicion?.estado === "REQUIERE_REVISION") {
              requierenRevision++;
            }
            continue;
          }
          const nombre = nombres.get(recurso.claveOrigen)!;
          const inicial: EstadoCalculadoArchivoZoom =
            multiplicidad <= 1 && nombre.colision
              ? { estado: "REQUIERE_REVISION", errorCodigo: "NOMBRE_DESTINO_COLISION" }
              : estadoInicialArchivoZoom(recurso, multiplicidad);
          await tx.archivoOrigenZoom.create({
            data: {
              ocurrenciaId: ocurrencia.id,
              claveOrigen: recurso.claveOrigen,
              nombreDestino: nombre.nombre,
              ...datos,
              estado: inicial.estado,
              errorCodigo: inicial.errorCodigo
            }
          });
          creados++;
          if (inicial.estado === "REQUIERE_REVISION") {
            requierenRevision++;
          }
        }
        return { ocurrenciaId: ocurrencia.id, nuevos: creados, actualizados, requierenRevision };
      });
    },

    async guardarCarpetaOcurrencia(ocurrenciaId, driveFolderId) {
      const { count } = await db.ocurrenciaArchivoZoom.updateMany({
        where: { id: ocurrenciaId, driveFolderId: null },
        data: { driveFolderId }
      });
      return count === 1;
    },

    async listarOcurrenciasPorInventariar(ahora, limite) {
      if (!Number.isInteger(limite) || limite <= 0) {
        throw new RangeError("El límite debe ser un entero positivo.");
      }
      const filas = await db.ocurrenciaArchivoZoom.findMany({
        where: { proximoInventarioAt: { lte: ahora } },
        orderBy: [{ proximoInventarioAt: "asc" }, { id: "asc" }],
        take: limite,
        select: {
          cuentaZoomId: true,
          uuid: true,
          meetingId: true,
          anfitrionZoomId: true,
          inicioRealAt: true,
          titulo: true,
          cuentaProveedorId: true
        }
      });
      return filas.map((f) => ({
        referencia: {
          cuentaZoomId: f.cuentaZoomId,
          uuid: f.uuid,
          meetingId: f.meetingId,
          anfitrionZoomId: f.anfitrionZoomId,
          inicioRealAt: f.inicioRealAt,
          titulo: f.titulo
        },
        cuentaProveedorId: f.cuentaProveedorId
      }));
    },

    async reclamarArchivo(ahora, duracionMs) {
      if (!Number.isFinite(duracionMs) || duracionMs <= 0) {
        throw new RangeError("La duración del lease debe ser positiva.");
      }
      const venceAt = new Date(ahora.getTime() + duracionMs);
      for (let ronda = 0; ronda < RONDAS_DE_RECLAMO; ronda++) {
        const candidatos = await db.archivoOrigenZoom.findMany({
          where: elegibleParaReclamo(ahora),
          orderBy: [
            { proximoIntentoAt: { sort: "asc", nulls: "first" } },
            { createdAt: "asc" },
            { id: "asc" }
          ],
          take: CANDIDATOS_POR_RONDA,
          select: { id: true, leaseVersion: true, estado: true }
        });
        if (candidatos.length === 0) {
          return null;
        }
        for (const candidato of candidatos) {
          const version = candidato.leaseVersion + 1;
          // Un lease vencido es un intento caído (p. ej. el worker murió): consume un intento
          // para que el consumidor pueda cortar bucles de caídas con REQUIERE_REVISION.
          const leaseVencido = candidato.estado === "COPIANDO";
          // Concurrencia optimista: solo gana quien todavía ve la versión y el estado leídos.
          const { count } = await db.archivoOrigenZoom.updateMany({
            where: {
              id: candidato.id,
              leaseVersion: candidato.leaseVersion,
              estado: candidato.estado,
              AND: [elegibleParaReclamo(ahora)]
            },
            data: {
              estado: "COPIANDO",
              leaseVersion: version,
              leaseHasta: venceAt,
              ...(leaseVencido
                ? {
                    intentos: { increment: 1 },
                    errorCodigo: "LEASE_VENCIDO",
                    errorDetalle: "El intento anterior no renovó su lease y se recuperó."
                  }
                : {})
            }
          });
          if (count !== 1) {
            continue;
          }
          if (leaseVencido) {
            await cerrarReservasDeLeasesAnteriores(db, candidato.id, version, ahora);
          }
          return { archivoId: candidato.id, version, venceAt };
        }
      }
      return null;
    },

    async obtenerArchivoReclamado(lease): Promise<ArchivoReclamadoZoom | null> {
      const fila = await db.archivoOrigenZoom.findFirst({
        where: leaseVigente(lease),
        include: { ocurrencia: true }
      });
      if (!fila) {
        return null;
      }
      const o = fila.ocurrencia;
      return {
        lease: { archivoId: fila.id, version: fila.leaseVersion, venceAt: fila.leaseHasta ?? lease.venceAt },
        ocurrenciaId: o.id,
        ocurrencia: {
          cuentaZoomId: o.cuentaZoomId,
          uuid: o.uuid,
          meetingId: o.meetingId,
          anfitrionZoomId: o.anfitrionZoomId,
          inicioRealAt: o.inicioRealAt,
          titulo: o.titulo
        },
        eventoProveedorId: o.eventoProveedorId,
        driveFolderId: o.driveFolderId,
        recurso: { claveOrigen: fila.claveOrigen, ...metadatosRecurso(fila) },
        nombreDestino: fila.nombreDestino,
        driveFileId: fila.driveFileId,
        uploadSessionCifrada: fila.uploadSessionCifrada,
        bytesConfirmados: fila.bytesConfirmados,
        intentos: fila.intentos
      };
    },

    async guardarProgreso(lease, progreso: ProgresoArchivoZoom) {
      if (progreso.bytesConfirmados < 0n) {
        throw new RangeError("Los bytes confirmados no pueden ser negativos.");
      }
      exigirSesionCifrada(progreso.uploadSessionCifrada);
      const { count } = await db.archivoOrigenZoom.updateMany({
        where: leaseVigente(lease),
        data: {
          bytesConfirmados: progreso.bytesConfirmados,
          ...(progreso.uploadSessionCifrada !== undefined
            ? { uploadSessionCifrada: progreso.uploadSessionCifrada }
            : {}),
          ...(progreso.driveFileId !== undefined ? { driveFileId: progreso.driveFileId } : {}),
          ...(progreso.leaseHasta ? { leaseHasta: progreso.leaseHasta } : {})
        }
      });
      return count === 1;
    },

    async confirmarConservado(lease, destino: DestinoConservadoZoom) {
      const ahora = reloj();
      try {
        return await db.$transaction(async (tx) => {
          const archivo = await tx.archivoOrigenZoom.findUnique({
            where: { id: lease.archivoId },
            select: { ocurrenciaId: true }
          });
          if (!archivo) {
            return false;
          }
          await bloquearOcurrencia(tx, archivo.ocurrenciaId);
          const { count } = await tx.archivoOrigenZoom.updateMany({
            where: leaseVigente(lease),
            data: {
              estado: "CONSERVADO",
              driveFileId: destino.id,
              bytesConfirmados: destino.tamanoBytes,
              mimeType: destino.mimeType,
              webViewUrl: destino.webViewUrl,
              conservadoAt: ahora,
              leaseHasta: null,
              uploadSessionCifrada: null,
              errorCodigo: null,
              errorDetalle: null,
              proximoIntentoAt: null
            }
          });
          if (count === 0) {
            // Reintento del mismo worker tras perder la respuesta: idempotente solo con el mismo destino.
            const fila = await tx.archivoOrigenZoom.findUnique({
              where: { id: lease.archivoId },
              select: { estado: true, leaseVersion: true, driveFileId: true }
            });
            return (
              fila?.estado === "CONSERVADO" &&
              fila.leaseVersion === lease.version &&
              fila.driveFileId === destino.id
            );
          }
          const ocurrencia = await tx.ocurrenciaArchivoZoom.findUniqueOrThrow({
            where: { id: archivo.ocurrenciaId },
            select: { cuentaZoomId: true, uuid: true, inicioRealAt: true, eventoProveedorId: true }
          });
          if (ocurrencia.eventoProveedorId) {
            const conservado = await tx.archivoOrigenZoom.findUniqueOrThrow({
              where: { id: lease.archivoId },
              select: SELECCION_REFERENCIA
            });
            await asegurarReferenciaLocal(
              tx,
              conservado,
              { ...ocurrencia, eventoProveedorId: ocurrencia.eventoProveedorId },
              destino.nombre
            );
          }
          return true;
        });
      } catch (error) {
        if (!esUnicidadViolada(error)) {
          throw error;
        }
        // El Drive ID ya pertenece a otro archivo de origen o a otra referencia local: nunca una segunda copia.
        await db.archivoOrigenZoom.updateMany({
          where: leaseVigente(lease),
          data: {
            estado: "REQUIERE_REVISION",
            errorCodigo: "DRIVE_ID_DUPLICADO",
            errorDetalle: "El ID de Drive confirmado ya está registrado para otro recurso.",
            leaseHasta: null
          }
        });
        return false;
      }
    },

    async registrarFallo(lease, fallo: FalloArchivoZoom) {
      const base = leaseVigente(lease);
      const comun = {
        errorCodigo: sanearErrorZoom(fallo.codigo, 100) ?? "ERROR",
        errorDetalle: sanearErrorZoom(fallo.detalle),
        leaseHasta: null
      };
      if (fallo.tipo === "ESPERA") {
        const { count } = await db.archivoOrigenZoom.updateMany({
          where: base,
          data: { ...comun, estado: "PENDIENTE", proximoIntentoAt: fallo.proximoIntentoAt }
        });
        return count === 1;
      }
      const revision = {
        ...comun,
        estado: "REQUIERE_REVISION" as const,
        intentos: { increment: 1 },
        proximoIntentoAt: null
      };
      if (fallo.tipo === "REVISION") {
        return (await db.archivoOrigenZoom.updateMany({ where: base, data: revision })).count === 1;
      }
      const reintento = {
        ...comun,
        estado: "ERROR_REINTENTABLE" as const,
        intentos: { increment: 1 },
        proximoIntentoAt: fallo.proximoIntentoAt
      };
      const limite = fallo.limiteIntentos ?? null;
      if (limite === null) {
        return (await db.archivoOrigenZoom.updateMany({ where: base, data: reintento })).count === 1;
      }
      // Cada sentencia decide atómicamente según los intentos actuales de la fila.
      const bajoLimite = await db.archivoOrigenZoom.updateMany({
        where: { ...base, intentos: { lt: limite - 1 } },
        data: reintento
      });
      if (bajoLimite.count === 1) {
        return true;
      }
      return (
        (
          await db.archivoOrigenZoom.updateMany({
            where: { ...base, intentos: { gte: limite - 1 } },
            data: revision
          })
        ).count === 1
      );
    },

    async reservarTransferencia(
      lease,
      solicitud: SolicitudReservaTransferenciaZoom
    ): Promise<ResultadoReservaTransferenciaZoom> {
      if (solicitud.bytes < 0n) {
        throw new RangeError("Los bytes a reservar no pueden ser negativos.");
      }
      const { ahora, limites } = solicitud;
      // Un único bloqueo transaccional para todo el cupo: suma y reserva son atómicas entre workers.
      return db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CLAVE_BLOQUEO_CUPO}))`;
        const vigente = await tx.archivoOrigenZoom.findFirst({
          where: leaseVigente(lease),
          select: { bytesConfirmados: true }
        });
        if (!vigente) {
          return { tipo: "LEASE_OBSOLETO" } as const;
        }
        // Red de seguridad si el proceso cayó entre el reclamo y el cierre de reservas anteriores.
        await cerrarReservasDeLeasesAnteriores(tx, lease.archivoId, lease.version, ahora);
        const reservas = await tx.reservaTransferenciaZoom.findMany({
          where: { reservadoAt: { gt: new Date(ahora.getTime() - limites.ventanaMs) } },
          select: { reservadoAt: true, bytesReservados: true, ajustadoBytes: true }
        });
        const evaluacion = evaluarCupoTransferenciaZoom(
          reservas.map((r) => ({ reservadoAt: r.reservadoAt, bytes: r.ajustadoBytes ?? r.bytesReservados })),
          solicitud.bytes,
          solicitud.prioridad,
          limites,
          ahora
        );
        if (!evaluacion.cabe) {
          return {
            tipo: "SIN_CUPO",
            disponibleBytes: evaluacion.disponibleBytes,
            liberacionEstimadaAt: evaluacion.liberacionEstimadaAt
          } as const;
        }
        const reserva = await tx.reservaTransferenciaZoom.create({
          data: {
            archivoOrigenId: lease.archivoId,
            leaseVersion: lease.version,
            bytesReservados: solicitud.bytes,
            bytesConfirmadosInicio: vigente.bytesConfirmados,
            prioridad: solicitud.prioridad,
            reservadoAt: ahora
          },
          select: { id: true }
        });
        return { tipo: "RESERVADA", reservaId: reserva.id, bytesReservados: solicitud.bytes } as const;
      });
    },

    async liberarReserva(reservaId, bytesTransferidos, ahora) {
      if (bytesTransferidos < 0n) {
        throw new RangeError("Los bytes transferidos no pueden ser negativos.");
      }
      const { count } = await db.reservaTransferenciaZoom.updateMany({
        where: { id: reservaId, liberadoAt: null },
        data: { ajustadoBytes: bytesTransferidos, liberadoAt: ahora }
      });
      return count === 1;
    },

    async vincularOcurrencia(
      ocurrenciaId,
      eventoId,
      actor: ActorVinculoZoom | null
    ): Promise<ResultadoVinculo> {
      const ahora = reloj();
      return db.$transaction(async (tx): Promise<ResultadoVinculo> => {
        const [fila] = await bloquearOcurrencia(tx, ocurrenciaId);
        if (!fila) {
          return { tipo: "NO_ENCONTRADA", recurso: "OCURRENCIA" };
        }
        const evento = await tx.eventoProveedor.findUnique({
          where: { id: eventoId },
          select: { proveedor: { select: { tipo: true } } }
        });
        if (!evento) {
          return { tipo: "NO_ENCONTRADA", recurso: "EVENTO" };
        }
        if (evento.proveedor.tipo !== "ZOOM" && evento.proveedor.tipo !== "ZOOM_HISTORICO") {
          return { tipo: "EVENTO_NO_ZOOM" };
        }
        if (fila.eventoProveedorId === eventoId) {
          return { tipo: "YA_VINCULADA" };
        }
        // Una ocurrencia pertenece a lo sumo a un encuentro: nunca se reasigna en silencio.
        if (fila.eventoProveedorId !== null) {
          return { tipo: "VINCULADA_A_OTRO", eventoProveedorId: fila.eventoProveedorId };
        }

        const ocurrencia = await tx.ocurrenciaArchivoZoom.update({
          where: { id: ocurrenciaId },
          data: { eventoProveedorId: eventoId, vinculadaAt: ahora, vinculadaPorId: actor?.id ?? null },
          select: { cuentaZoomId: true, uuid: true, inicioRealAt: true }
        });
        const conservados = await tx.archivoOrigenZoom.findMany({
          where: { ocurrenciaId, estado: "CONSERVADO", driveFileId: { not: null } },
          select: SELECCION_REFERENCIA
        });
        // Referencias locales al mismo archivo de Drive: no se transfiere de nuevo.
        for (const archivo of conservados) {
          await asegurarReferenciaLocal(
            tx,
            archivo,
            { ...ocurrencia, eventoProveedorId: eventoId },
            archivo.nombreDestino
          );
        }
        await tx.auditoria.create({
          data: {
            actorUsuarioId: actor?.id ?? null,
            accion: "ZOOM_OCURRENCIA_VINCULADA",
            entidadTipo: "OcurrenciaArchivoZoom",
            entidadId: ocurrenciaId,
            valorAnterior: { eventoProveedorId: null },
            valorNuevo: { eventoProveedorId: eventoId, referenciasCreadas: conservados.length }
          }
        });
        return { tipo: "VINCULADA", referenciasCreadas: conservados.length };
      });
    },

    async desvincularOcurrencia(
      ocurrenciaId,
      eventoId,
      actor: ActorVinculoZoom | null
    ): Promise<ResultadoDesvinculo> {
      return db.$transaction(async (tx): Promise<ResultadoDesvinculo> => {
        const [fila] = await bloquearOcurrencia(tx, ocurrenciaId);
        if (!fila) {
          return { tipo: "NO_ENCONTRADA" };
        }
        if (fila.eventoProveedorId !== eventoId) {
          return { tipo: "NO_VINCULADA" };
        }
        const referenciados = await tx.archivoOrigenZoom.findMany({
          where: { ocurrenciaId, archivoReunionId: { not: null } },
          select: { archivoReunionId: true }
        });
        const referencias = referenciados.flatMap((a) => (a.archivoReunionId ? [a.archivoReunionId] : []));
        await tx.archivoOrigenZoom.updateMany({
          where: { ocurrenciaId, archivoReunionId: { not: null } },
          data: { archivoReunionId: null }
        });
        // Solo se quitan las referencias locales de esta ocurrencia; inventario y Drive quedan intactos.
        const { count } = await tx.archivoReunion.deleteMany({
          where: { id: { in: referencias }, eventoProveedorId: eventoId }
        });
        await tx.ocurrenciaArchivoZoom.update({
          where: { id: ocurrenciaId },
          data: { eventoProveedorId: null, vinculadaAt: null, vinculadaPorId: null }
        });
        await tx.auditoria.create({
          data: {
            actorUsuarioId: actor?.id ?? null,
            accion: "ZOOM_OCURRENCIA_DESVINCULADA",
            entidadTipo: "OcurrenciaArchivoZoom",
            entidadId: ocurrenciaId,
            valorAnterior: { eventoProveedorId: eventoId },
            valorNuevo: { eventoProveedorId: null, referenciasEliminadas: count }
          }
        });
        return { tipo: "DESVINCULADA", referenciasEliminadas: count };
      });
    },
    async reintentarArchivo(archivoId, actor) {
      return db.$transaction(async (tx) => {
        const cambio = await tx.archivoOrigenZoom.updateMany({
          where: { id: archivoId, estado: { in: ["ERROR_REINTENTABLE", "REQUIERE_REVISION"] } },
          data: {
            estado: "PENDIENTE",
            intentos: 0,
            proximoIntentoAt: null,
            errorCodigo: null,
            errorDetalle: null,
            leaseHasta: null
          }
        });
        if (!cambio.count) {
          const existe = await tx.archivoOrigenZoom.findUnique({
            where: { id: archivoId },
            select: { id: true }
          });
          return { tipo: existe ? "ESTADO_NO_REINTENTABLE" : "NO_ENCONTRADO" } as const;
        }
        await tx.auditoria.create({
          data: {
            actorUsuarioId: actor?.id ?? null,
            accion: "ZOOM_ARCHIVO_REINTENTO",
            entidadTipo: "ArchivoOrigenZoom",
            entidadId: archivoId,
            valorNuevo: { estado: "PENDIENTE" }
          }
        });
        return { tipo: "OK" } as const;
      });
    }
  };
}
