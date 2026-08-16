import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationApiError extends ApiError {
  constructor(message: string) { super(message, 400); }
}
export class ForbiddenApiError extends ApiError {
  constructor(message: string) { super(message, 403); }
}
export class NotFoundApiError extends ApiError {
  constructor(message: string) { super(message, 404); }
}
export class ConflictApiError extends ApiError {
  constructor(message: string) { super(message, 409); }
}
export class IntegrationApiError extends ApiError {
  constructor(message: string, status: 502 | 503 = 502) { super(message, status); }
}

export function toHttpError(error: unknown): Readonly<{ status: number; message: string }> {
  if (error instanceof ApiError) return { status: error.status, message: error.message };
  if (error instanceof ZodError) {
    return {
      status: 400,
      message: error.issues[0]?.message ?? "Datos inválidos.",
    };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return { status: 409, message: "La operación entra en conflicto con datos existentes." };
    if (error.code === "P2025") return { status: 404, message: "El recurso solicitado no existe." };
  }
  console.error("Unhandled API error", error);
  return { status: 500, message: "Ocurrió un error interno al procesar la solicitud." };
}
