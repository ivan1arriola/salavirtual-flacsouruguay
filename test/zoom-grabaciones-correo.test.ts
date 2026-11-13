import type { PrismaClient } from "@prisma/client";
import type { JWT } from "google-auth-library";
import { describe, expect, it, vi } from "vitest";
import {
  grabacionZoomListaParaAvisar,
  notificarGrabacionesZoom
} from "../src/bootstrap/zoom-grabaciones-correo.server";
import { crearCompartirArchivoZoom } from "../src/modules/archivos/infrastructure/google/google-zoom-archivo-sharing.adapter";

const archivo = {
  estado: "CONSERVADO",
  tipoOriginal: "MP4",
  driveFileId: "archivo-1",
  nombreDestino: "Clase.mp4"
};
const enlace = {
  eventoProveedorId: "evento-1",
  carpetaVinculadaAt: new Date(),
  procesamientoPendiente: false,
  observacionesInventario: [],
  archivos: [archivo]
};

describe("correo de grabación Zoom completa", () => {
  it("espera a que todos los archivos estén conservados y la carpeta vinculada", () => {
    expect(grabacionZoomListaParaAvisar(enlace)).toBe(true);
    expect(grabacionZoomListaParaAvisar({ ...enlace, carpetaVinculadaAt: null })).toBe(false);
    expect(grabacionZoomListaParaAvisar({ ...enlace, procesamientoPendiente: true })).toBe(false);
    expect(
      grabacionZoomListaParaAvisar({ ...enlace, observacionesInventario: [{ tipo: "ELEMENTO_INVALIDO" }] })
    ).toBe(false);
    expect(
      grabacionZoomListaParaAvisar({ ...enlace, archivos: [archivo, { ...archivo, estado: "PENDIENTE" }] })
    ).toBe(false);
  });

  it("envía los enlaces privados a la docente y administración una sola vez por destinatario", async () => {
    const avisos = [
      { id: "aviso-1", email: "florencia@flacso.edu.uy", ocurrenciaId: "ocurrencia-1" },
      { id: "aviso-2", email: "admin@flacso.edu.uy", ocurrenciaId: "ocurrencia-1" }
    ];
    const findManyOcurrencias = vi.fn().mockResolvedValueOnce([
      {
        ...enlace,
        id: "ocurrencia-1",
        eventoProveedor: {
          instancia: { solicitud: { docentePrograma: { docente: { usuarioId: "docente-1" } } } }
        }
      }
    ]);
    const findUnique = vi.fn().mockResolvedValue({
      ...enlace,
      driveFolderId: "carpeta-1",
      inicioRealAt: new Date("2026-11-13T12:00:00Z"),
      eventoProveedor: {
        instancia: {
          solicitud: {
            titulo: "Clase de prueba",
            docentePrograma: { programa: { nombre: "Seminario" } }
          }
        }
      }
    });
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const updateManyOcurrencias = vi.fn().mockResolvedValue({ count: 1 });
    const updateManyAvisos = vi.fn().mockResolvedValue({ count: 1 });
    const updateAviso = vi.fn().mockResolvedValue({});
    const db = {
      ocurrenciaArchivoZoom: { findMany: findManyOcurrencias, findUnique, updateMany: updateManyOcurrencias },
      usuario: {
        findMany: vi.fn().mockResolvedValue([
          { id: "docente-1", emailPrincipal: "Florencia@flacso.edu.uy" },
          { id: "admin-1", emailPrincipal: "admin@flacso.edu.uy" },
          { id: "docente-1", emailPrincipal: "florencia@flacso.edu.uy" }
        ])
      },
      avisoGrabacionZoom: {
        createMany,
        findMany: vi.fn().mockResolvedValue(avisos),
        updateMany: updateManyAvisos,
        update: updateAviso
      },
      $transaction: (run: (tx: unknown) => Promise<unknown>) => run(db)
    };
    const compartirArchivo = vi.fn().mockResolvedValue(undefined);
    const enviarCorreo = vi.fn().mockResolvedValue({ sent: true, transport: "AMAZON_SES" });
    const result = await notificarGrabacionesZoom(
      { db: db as unknown as PrismaClient, compartirArchivo, enviarCorreo },
      "cuenta-1"
    );
    expect(result).toEqual({ preparados: 1, enviados: 2, errores: 0 });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { ocurrenciaId: "ocurrencia-1", email: "florencia@flacso.edu.uy" },
        { ocurrenciaId: "ocurrencia-1", email: "admin@flacso.edu.uy" }
      ],
      skipDuplicates: true
    });
    expect(compartirArchivo).toHaveBeenCalledTimes(2);
    expect(enviarCorreo).toHaveBeenCalledTimes(2);
    expect(enviarCorreo.mock.calls[0][0].text).toContain("https://drive.google.com/file/d/archivo-1/view");
    expect(enviarCorreo.mock.calls[0][0].text).not.toContain("carpeta-1");
    expect(updateAviso).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "ACEPTADO" }) })
    );
  });

  it("conserva la reserva si el envío es incierto para no duplicar correos", async () => {
    const update = vi.fn();
    const db = {
      ocurrenciaArchivoZoom: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue({
          ...enlace,
          driveFolderId: "carpeta",
          inicioRealAt: new Date(),
          eventoProveedor: {
            instancia: {
              solicitud: { titulo: "Clase", docentePrograma: { programa: { nombre: "Programa" } } }
            }
          }
        })
      },
      avisoGrabacionZoom: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "aviso", ocurrenciaId: "ocurrencia", email: "docente@flacso.edu.uy" }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update
      }
    };
    const result = await notificarGrabacionesZoom(
      {
        db: db as unknown as PrismaClient,
        compartirArchivo: vi.fn().mockResolvedValue(undefined),
        enviarCorreo: vi.fn().mockRejectedValue(new Error("respuesta incierta"))
      },
      "cuenta"
    );
    expect(result).toEqual({ preparados: 0, enviados: 0, errores: 1 });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("acceso Drive a la grabación", () => {
  it("crea permiso de lectura para el destinatario sin enlace público ni correo automático de Drive", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ data: { permissions: [] } })
      .mockResolvedValueOnce({ data: { id: "p" } });
    await crearCompartirArchivoZoom({ request } as unknown as JWT)("archivo-1", "DOCENTE@flacso.edu.uy");
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        data: { type: "user", role: "reader", emailAddress: "docente@flacso.edu.uy" }
      })
    );
    expect(request.mock.calls[1][0].url).toContain("sendNotificationEmail=false");
  });
});
