import { normalizarNombrePrograma } from "../../src/modules/migracion/reuniones-legacy.domain";
import { target } from "./clients";
import type { CuentaLegacy, ProgramaLegacy } from "./source";

export async function prepararCatalogos(
  programas: readonly ProgramaLegacy[],
  cuentas: readonly CuentaLegacy[]
) {
  const [zoom, meet] = await Promise.all([
    target.proveedorReunion.upsert({
      where: { tipo: "ZOOM_HISTORICO" },
      create: {
        tipo: "ZOOM_HISTORICO",
        nombre: "Zoom historico",
        operativo: false,
        historico: true
      },
      update: { operativo: false, historico: true }
    }),
    target.proveedorReunion.upsert({
      where: { tipo: "GOOGLE_MEET" },
      create: {
        tipo: "GOOGLE_MEET",
        nombre: "Google Meet",
        operativo: true,
        historico: false
      },
      update: { operativo: true, historico: false }
    })
  ]);

  for (const programa of programas) {
    const nombre = normalizarNombrePrograma(programa.nombre);
    await target.programa.upsert({
      where: { legacyZoomProgramaId: programa.id },
      create: { legacyZoomProgramaId: programa.id, nombre },
      update: { nombre }
    });
  }
  for (const cuenta of cuentas) {
    await target.cuentaProveedor.upsert({
      where: { legacyZoomCuentaId: cuenta.id },
      create: {
        legacyZoomCuentaId: cuenta.id,
        proveedorId: zoom.id,
        nombre: cuenta.nombreCuenta,
        emailOrganizador: cuenta.ownerEmail,
        externalAccountId: cuenta.zoomAccountId,
        secretRef: cuenta.clientSecretRef,
        prioridad: cuenta.prioridad,
        tieneLicencia: true,
        limiteConcurrente: cuenta.limiteEventosConcurrentes,
        activa: cuenta.activa,
        createdAt: cuenta.createdAt,
        updatedAt: cuenta.updatedAt
      },
      update: {
        nombre: cuenta.nombreCuenta,
        emailOrganizador: cuenta.ownerEmail,
        externalAccountId: cuenta.zoomAccountId,
        prioridad: cuenta.prioridad,
        tieneLicencia: true,
        limiteConcurrente: cuenta.limiteEventosConcurrentes,
        activa: cuenta.activa
      }
    });
  }

  return { zoomProviderId: zoom.id, meetProviderId: meet.id };
}

export async function cargarMapeos() {
  const [usuarios, programas, cuentas] = await Promise.all([
    target.usuario.findMany({
      where: { legacyZoomUserId: { not: null } },
      select: {
        id: true,
        legacyZoomUserId: true,
        docente: { select: { id: true } },
        asistenteTecnico: { select: { id: true } }
      }
    }),
    target.programa.findMany({
      select: { id: true, nombre: true }
    }),
    target.cuentaProveedor.findMany({
      where: { legacyZoomCuentaId: { not: null } },
      select: { id: true, legacyZoomCuentaId: true }
    })
  ]);

  return {
    usuariosPorLegacy: new Map(
      usuarios.map((usuario) => [usuario.legacyZoomUserId as string, usuario])
    ),
    programasPorNombre: new Map(
      programas.map((programa) => [
        normalizarNombrePrograma(programa.nombre).toLowerCase(),
        programa.id
      ])
    ),
    cuentasPorLegacy: new Map(
      cuentas.map((cuenta) => [cuenta.legacyZoomCuentaId as string, cuenta.id])
    )
  };
}

export type MapeosLegacy = Awaited<ReturnType<typeof cargarMapeos>>;
