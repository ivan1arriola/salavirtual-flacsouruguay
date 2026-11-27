import { describe, expect, it, vi } from "vitest";
import { normalizarConfiguracionCorreoSes } from "../src/modules/configuracion/correo-ses.domain";
import { actualizarConfiguracionCorreoSes } from "../src/modules/configuracion/correo-ses.service";

describe("configuración Amazon SES", () => {
  it("normaliza región y correos para una configuración activa", () => {
    expect(
      normalizarConfiguracionCorreoSes({
        activa: true,
        awsRegion: "us-east-1",
        fromEmail: " Avisos@flacso.edu.uy ",
        replyToEmail: " Respuestas@flacso.edu.uy ",
      }),
    ).toEqual({
      activa: true,
      awsRegion: "us-east-1",
      fromEmail: "avisos@flacso.edu.uy",
      replyToEmail: "respuestas@flacso.edu.uy",
    });
  });

  it("requiere región y remitente cuando SES está activo", () => {
    expect(() =>
      normalizarConfiguracionCorreoSes({
        activa: true,
        awsRegion: "",
        fromEmail: "",
      }),
    ).toThrow();
  });

  it("rechaza actores que no sean administradores activos antes de acceder a la base", async () => {
    const db = {
      $transaction: () => {
        throw new Error("No debe acceder a la base");
      },
    } as never;
    await expect(
      actualizarConfiguracionCorreoSes(
        db,
        { id: "docente", rol: "DOCENTE", activo: true },
        {
          activa: false,
          awsRegion: "",
          fromEmail: "",
          replyToEmail: "",
        },
      ),
    ).rejects.toThrow("Solo Administración");
  });

  it("vuelve a validar al administrador y registra los cambios en auditoría", async () => {
    const config = {
      activa: true,
      awsRegion: "us-east-1",
      fromEmail: "avisos@flacso.edu.uy",
      replyToEmail: null,
    };
    const tx = {
      usuario: {
        findUnique: vi.fn().mockResolvedValue({ id: "admin", rol: "ADMINISTRACION", activo: true }),
      },
      configuracionCorreoSes: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: "principal", ...config }),
      },
      auditoria: { create: vi.fn().mockResolvedValue({}) },
    };
    const db = {
      $transaction: vi.fn((callback: (value: typeof tx) => unknown) => callback(tx)),
    } as never;
    const saved = await actualizarConfiguracionCorreoSes(
      db,
      { id: "admin", rol: "ADMINISTRACION", activo: true },
      config,
    );
    expect(saved).toMatchObject(config);
    expect(tx.usuario.findUnique).toHaveBeenCalledWith({
      where: { id: "admin" },
      select: { id: true, rol: true, activo: true },
    });
    expect(tx.auditoria.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accion: "CONFIGURACION_CORREO_SES_ACTUALIZADA",
          entidadId: "principal",
          valorNuevo: config,
        }),
      }),
    );
  });
});
