// Worker de Node: no usa server-only para poder ejecutarse fuera de Next.
import type { PrismaClient } from "@prisma/client";
import { escaparHtmlEmail, envolverCorreo } from "../lib/email/email-design-system";
import type { MailInput, MailSendResult } from "../modules/notificaciones/domain";

type Dependencias = Readonly<{
  db: PrismaClient;
  compartirArchivo: (fileId: string, email: string) => Promise<void>;
  enviarCorreo: (input: MailInput) => Promise<MailSendResult>;
  ahora?: () => Date;
}>;

const LOTE = 20;

type ArchivoParaAviso = Readonly<{ driveFileId: string | null; nombreDestino: string; estado: string }>;

export function grabacionZoomListaParaAvisar(
  ocurrencia: Readonly<{
    eventoProveedorId: string | null;
    carpetaVinculadaAt: Date | null;
    procesamientoPendiente: boolean;
    observacionesInventario: unknown;
    archivos: readonly ArchivoParaAviso[];
  }>
): boolean {
  return (
    Boolean(ocurrencia.eventoProveedorId && ocurrencia.carpetaVinculadaAt) &&
    !ocurrencia.procesamientoPendiente &&
    (!Array.isArray(ocurrencia.observacionesInventario) || ocurrencia.observacionesInventario.length === 0) &&
    ocurrencia.archivos.some((archivo) => archivo.estado === "CONSERVADO") &&
    ocurrencia.archivos.every((archivo) => archivo.estado === "CONSERVADO" && Boolean(archivo.driveFileId))
  );
}

function correoGrabacion(
  input: Readonly<{
    titulo: string;
    programa: string;
    fecha: Date;
    archivos: readonly { driveFileId: string; nombreDestino: string }[];
  }>
): Pick<MailInput, "subject" | "text" | "html"> {
  const fecha = new Intl.DateTimeFormat("es-UY", {
    timeZone: "America/Montevideo",
    dateStyle: "full",
    timeStyle: "short"
  }).format(input.fecha);
  const archivos = input.archivos.map((archivo) => ({
    nombre: archivo.nombreDestino,
    url: `https://drive.google.com/file/d/${encodeURIComponent(archivo.driveFileId)}/view`
  }));
  const text = [
    "La grabación de Zoom y todos sus archivos ya están en Drive.",
    `Clase: ${input.titulo}`,
    `Programa: ${input.programa}`,
    `Fecha: ${fecha}`,
    "",
    "Archivos:",
    ...archivos.map((archivo) => `${archivo.nombre}: ${archivo.url}`)
  ].join("\n");
  const e = escaparHtmlEmail;
  const enlacesHtml = archivos
    .map((archivo) => `<li><a href="${e(archivo.url)}">${e(archivo.nombre)}</a></li>`)
    .join("");
  const html = envolverCorreo({
    categoria: "Grabaciones de Zoom",
    titulo: "Grabación disponible en Drive",
    resumen: `La grabación de ${input.titulo} y todos sus archivos ya están disponibles.`,
    variante: "accion",
    contenidoHtml:
      `<p><strong>${e(input.titulo)}</strong> · ${e(input.programa)}<br>${e(fecha)}</p>` +
      `<ul>${enlacesHtml}</ul>`,
    nota: "Los enlaces son privados para las personas destinatarias de este correo.",
    preferenciasUrl: null
  });
  return { subject: `Grabación disponible: ${input.titulo} · Sala Virtual FLACSO`, text, html };
}

async function prepararAvisos(deps: Dependencias, cuentaZoomId: string): Promise<number> {
  const ahora = (deps.ahora ?? (() => new Date()))();
  const candidatas = await deps.db.ocurrenciaArchivoZoom.findMany({
    where: {
      cuentaZoomId,
      notificacionGrabacionPreparadaAt: null,
      inventariadoAt: { not: null },
      eventoProveedorId: { not: null },
      carpetaVinculadaAt: { not: null },
      procesamientoPendiente: false,
      observacionesInventario: { equals: [] },
      archivos: {
        some: { tipoOriginal: "MP4", estado: "CONSERVADO", driveFileId: { not: null } },
        none: { OR: [{ estado: { not: "CONSERVADO" } }, { driveFileId: null }] }
      }
    },
    select: {
      id: true,
      eventoProveedorId: true,
      carpetaVinculadaAt: true,
      procesamientoPendiente: true,
      observacionesInventario: true,
      archivos: { select: { estado: true, driveFileId: true, nombreDestino: true } },
      eventoProveedor: {
        select: {
          instancia: {
            select: {
              solicitud: {
                select: { docentePrograma: { select: { docente: { select: { usuarioId: true } } } } }
              }
            }
          }
        }
      }
    },
    orderBy: { inicioRealAt: "desc" },
    take: LOTE
  });

  let preparados = 0;
  for (const ocurrencia of candidatas) {
    if (!grabacionZoomListaParaAvisar(ocurrencia)) {
      continue;
    }
    const docenteId = ocurrencia.eventoProveedor?.instancia.solicitud.docentePrograma.docente.usuarioId;
    if (!docenteId) {
      continue;
    }
    const usuarios = await deps.db.usuario.findMany({
      where: {
        activo: true,
        fusionadoEnId: null,
        emailPrincipal: { not: null },
        OR: [{ id: docenteId }, { rol: "ADMINISTRACION" }]
      },
      select: { id: true, emailPrincipal: true }
    });
    if (!usuarios.some((usuario) => usuario.id === docenteId && usuario.emailPrincipal?.trim())) {
      continue;
    }
    const emails = [
      ...new Set(
        usuarios.flatMap(({ emailPrincipal }) =>
          emailPrincipal ? [emailPrincipal.trim().toLowerCase()] : []
        )
      )
    ].filter(Boolean);
    if (emails.length === 0) {
      continue;
    }
    const creado = await deps.db.$transaction(async (tx) => {
      const reclamo = await tx.ocurrenciaArchivoZoom.updateMany({
        where: { id: ocurrencia.id, notificacionGrabacionPreparadaAt: null },
        data: { notificacionGrabacionPreparadaAt: ahora }
      });
      if (reclamo.count !== 1) {
        return false;
      }
      await tx.avisoGrabacionZoom.createMany({
        data: emails.map((email) => ({ ocurrenciaId: ocurrencia.id, email })),
        skipDuplicates: true
      });
      return true;
    });
    if (creado) {
      preparados++;
    }
  }

  return preparados;
}

async function entregarAvisos(
  deps: Dependencias,
  cuentaZoomId: string
): Promise<Readonly<{ enviados: number; errores: number }>> {
  const avisos = await deps.db.avisoGrabacionZoom.findMany({
    where: { estado: { in: ["PENDIENTE", "ERROR"] }, ocurrencia: { cuentaZoomId } },
    select: { id: true, email: true, ocurrenciaId: true },
    orderBy: { updatedAt: "asc" },
    take: LOTE
  });
  let enviados = 0;
  let errores = 0;
  for (const aviso of avisos) {
    const ocurrencia = await deps.db.ocurrenciaArchivoZoom.findUnique({
      where: { id: aviso.ocurrenciaId },
      select: {
        eventoProveedorId: true,
        carpetaVinculadaAt: true,
        procesamientoPendiente: true,
        observacionesInventario: true,
        driveFolderId: true,
        inicioRealAt: true,
        archivos: { select: { estado: true, tipoOriginal: true, driveFileId: true, nombreDestino: true } },
        eventoProveedor: {
          select: {
            instancia: {
              select: {
                solicitud: {
                  select: {
                    titulo: true,
                    docentePrograma: { select: { programa: { select: { nombre: true } } } }
                  }
                }
              }
            }
          }
        }
      }
    });
    if (
      !ocurrencia ||
      !grabacionZoomListaParaAvisar(ocurrencia) ||
      !ocurrencia.archivos.some((archivo) => archivo.tipoOriginal === "MP4") ||
      !ocurrencia.driveFolderId ||
      !ocurrencia.eventoProveedor
    ) {
      continue;
    }
    const claim = await deps.db.avisoGrabacionZoom.updateMany({
      where: { id: aviso.id, estado: { in: ["PENDIENTE", "ERROR"] } },
      data: { estado: "RESERVADO", errorCodigo: null }
    });
    if (claim.count !== 1) {
      continue;
    }
    let compartidos = false;
    try {
      for (const archivo of ocurrencia.archivos) {
        await deps.compartirArchivo(archivo.driveFileId!, aviso.email);
      }
      compartidos = true;
      const correo = correoGrabacion({
        titulo: ocurrencia.eventoProveedor.instancia.solicitud.titulo,
        programa: ocurrencia.eventoProveedor.instancia.solicitud.docentePrograma.programa.nombre,
        fecha: ocurrencia.inicioRealAt,
        archivos: ocurrencia.archivos.map((archivo) => ({
          driveFileId: archivo.driveFileId!,
          nombreDestino: archivo.nombreDestino
        }))
      });
      const resultado = await deps.enviarCorreo({ ...correo, to: [aviso.email], idempotencyKey: aviso.id });
      if (!resultado.sent && resultado.skipped) {
        await deps.db.avisoGrabacionZoom.update({
          where: { id: aviso.id },
          data: { estado: "ERROR", errorCodigo: resultado.skipped }
        });
        errores++;
        continue;
      }
      if (!resultado.sent) {
        // El proveedor no confirmó si aceptó el mensaje: dejar RESERVADO.
        errores++;
        continue;
      }
      await deps.db.avisoGrabacionZoom.update({
        where: { id: aviso.id },
        data: { estado: "ACEPTADO", enviadoAt: new Date(), errorCodigo: null }
      });
      enviados++;
    } catch {
      // Una caída después de intentar enviar puede ser ambigua: RESERVADO no se reenvía solo.
      if (!compartidos) {
        await deps.db.avisoGrabacionZoom.update({
          where: { id: aviso.id },
          data: { estado: "ERROR", errorCodigo: "PERMISO_DRIVE" }
        });
      }
      errores++;
    }
  }
  return { enviados, errores };
}

/** Prepara destinatarios una sola vez por ocurrencia y envía los avisos pendientes con reclamo atómico. */
export async function notificarGrabacionesZoom(
  deps: Dependencias,
  cuentaZoomId: string
): Promise<Readonly<{ preparados: number; enviados: number; errores: number }>> {
  const preparados = await prepararAvisos(deps, cuentaZoomId);
  const resultado = await entregarAvisos(deps, cuentaZoomId);
  return { preparados, ...resultado };
}
