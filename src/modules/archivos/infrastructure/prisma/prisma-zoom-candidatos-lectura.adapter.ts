import type { PrismaClient } from "@prisma/client";
import type { ZoomCandidatosLecturaPort } from "../../ports/zoom-candidatos-lectura.port";
export function crearPrismaZoomCandidatosLecturaAdapter(db: PrismaClient): ZoomCandidatosLecturaPort {
 return { async listarEncuentrosCandidatosZoom(ocurrenciaId) {
  const o = await db.ocurrenciaArchivoZoom.findUnique({ where: { id: ocurrenciaId }, select: { inicioRealAt: true } });
  if (!o) return null;
  const centro = o.inicioRealAt.getTime(), dia = 86400000;
  const eventos = await db.eventoProveedor.findMany({
   where: { proveedor: { tipo: { in: ["ZOOM", "ZOOM_HISTORICO"] } }, instancia: { inicioProgramadoAt: { gte: new Date(centro-dia), lte: new Date(centro+dia) } }, ocurrenciasArchivoZoom: { none: { id: ocurrenciaId } } },
   select: { id: true, instancia: { select: { inicioProgramadoAt: true, solicitud: { select: { titulo: true, docentePrograma: { select: { programa: { select: { nombre: true } }, docente: { select: { usuario: { select: { nombres: true, apellidos: true } } } } } } } } } } }
  });
  return eventos.map(e => ({ id: e.id, titulo: e.instancia.solicitud.titulo, programa: e.instancia.solicitud.docentePrograma.programa.nombre, docente: [e.instancia.solicitud.docentePrograma.docente.usuario.nombres, e.instancia.solicitud.docentePrograma.docente.usuario.apellidos].filter(Boolean).join(" "), fecha: e.instancia.inicioProgramadoAt })).sort((a,b) => Math.abs(a.fecha.getTime()-centro)-Math.abs(b.fecha.getTime()-centro) || a.id.localeCompare(b.id)).slice(0,20);
 } };
}
