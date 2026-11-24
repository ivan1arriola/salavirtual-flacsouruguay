import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  ConflictApiError,
  ForbiddenApiError,
  IntegrationApiError,
  NotFoundApiError,
  ValidationApiError,
  errorParaPanel,
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
    const parsed = z
      .object({ nombre: z.string().min(3, "Nombre demasiado corto") })
      .safeParse({ nombre: "x" });
    if (parsed.success) {
      throw new Error("La prueba esperaba un error de Zod");
    }

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

describe("errorParaPanel", () => {
  const fallback = "No se pudo guardar.";

  it("muestra solo el primer mensaje de un error de validación de zod, no el JSON completo", () => {
    const resultado = z
      .object({ region: z.string().min(1, "Ingresá una región válida.") })
      .safeParse({ region: "" });
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(errorParaPanel(resultado.error, fallback)).toEqual({
        status: 400,
        message: "Ingresá una región válida."
      });
    }
  });

  it("conserva el mensaje y el status de los errores de la API", () => {
    expect(errorParaPanel(new ConflictApiError("Ya existe."), fallback)).toEqual({
      status: 409,
      message: "Ya existe."
    });
  });

  it("conserva el mensaje de un Error común de dominio, acotado a 300 caracteres", () => {
    expect(errorParaPanel(new Error("Programa no válido."), fallback)).toEqual({
      status: 400,
      message: "Programa no válido."
    });
    expect(errorParaPanel(new Error("x".repeat(500)), fallback).message).toHaveLength(300);
  });

  it("oculta los errores de Prisma y de valores que no son Error, y los registra", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    class PrismaClientInitializationError extends Error {}
    const baseCaida = new PrismaClientInitializationError("Can't reach database server at db.interno:5432");
    expect(errorParaPanel(baseCaida, fallback)).toEqual({ status: 500, message: fallback });
    expect(errorParaPanel(Object.assign(new Error("detalle"), { code: "P1001" }), fallback)).toEqual({
      status: 500,
      message: fallback
    });
    expect(errorParaPanel("cadena", fallback)).toEqual({ status: 500, message: fallback });
    expect(consoleError).toHaveBeenCalledWith("Error no controlado", baseCaida);
    consoleError.mockRestore();
  });
});
