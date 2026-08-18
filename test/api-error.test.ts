import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  ConflictApiError,
  ForbiddenApiError,
  IntegrationApiError,
  NotFoundApiError,
  ValidationApiError,
  toHttpError
} from "../src/lib/http/api-error";

describe("errores HTTP", () => {
  it.each([
    [new ValidationApiError("validación"), 400, "ValidationApiError"],
    [new ForbiddenApiError("prohibido"), 403, "ForbiddenApiError"],
    [new NotFoundApiError("no existe"), 404, "NotFoundApiError"],
    [new ConflictApiError("conflicto"), 409, "ConflictApiError"],
    [new IntegrationApiError("google"), 502, "IntegrationApiError"],
    [new IntegrationApiError("google caído", 503), 503, "IntegrationApiError"]
  ] as const)("preserva el status de %s", (error, status, name) => {
    expect(error.name).toBe(name);
    expect(toHttpError(error)).toEqual({ status, message: error.message });
  });

  it("convierte el primer problema de Zod en un 400", () => {
    const parsed = z.object({ nombre: z.string().min(3, "Nombre demasiado corto") }).safeParse({ nombre: "x" });
    if (parsed.success) throw new Error("La prueba esperaba un error de Zod");

    expect(toHttpError(parsed.error)).toEqual({
      status: 400,
      message: "Nombre demasiado corto"
    });
  });

  it("mapea conflictos y ausencias conocidos de Prisma sin depender de Prisma", () => {
    expect(toHttpError({ code: "P2002" })).toEqual({
      status: 409,
      message: "La operación entra en conflicto con datos existentes."
    });
    expect(toHttpError({ code: "P2025" })).toEqual({
      status: 404,
      message: "El recurso solicitado no existe."
    });
  });

  it("no interpreta como código Prisma valores no string", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(toHttpError({ code: 2002 })).toEqual({
      status: 500,
      message: "Ocurrió un error interno al procesar la solicitud."
    });
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("oculta detalles de errores internos inesperados y los registra", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("secreto interno");

    expect(toHttpError(error)).toEqual({
      status: 500,
      message: "Ocurrió un error interno al procesar la solicitud."
    });
    expect(consoleError).toHaveBeenCalledWith("Unhandled API error", error);
    consoleError.mockRestore();
  });
});
