import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationApiError extends ApiError {
  constructor(message: string) {
    super(message, 400);
  }
}
export class ForbiddenApiError extends ApiError {
  constructor(message: string) {
    super(message, 403);
  }
}
export class NotFoundApiError extends ApiError {
  constructor(message: string) {
    super(message, 404);
  }
}
export class ConflictApiError extends ApiError {
  constructor(message: string) {
    super(message, 409);
  }
}
export class IntegrationApiError extends ApiError {
  constructor(message: string, status: 502 | 503 = 502) {
    super(message, status);
  }
}

export function toHttpError(error: unknown): Readonly<{ status: number; message: string }> {
  if (error instanceof ApiError) {
    return { status: error.status, message: error.message };
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      message: error.issues[0]?.message ?? "Datos inválidos."
    };
  }
  const code = prismaErrorCode(error);
  if (code === "P2002") {
    return { status: 409, message: "La operación entra en conflicto con datos existentes." };
  }
  if (code === "P2025") {
    return { status: 404, message: "El recurso solicitado no existe." };
  }
  console.error("Unhandled API error", error);
  return { status: 500, message: "Ocurrió un error interno al procesar la solicitud." };
}

const LARGO_MAXIMO_MENSAJE = 300;

/**
 * Mensaje apto para mostrar a una persona en un panel o formulario. Los Error comunes de los
 * servicios llevan texto de dominio en español y se muestran; los de Prisma, los de código
 * desconocido y los que no son Error se registran y se reemplazan por `fallback`.
 */
export function errorParaPanel(
  error: unknown,
  fallback: string
): Readonly<{ status: number; message: string }> {
  if (error instanceof ApiError) {
    return { status: error.status, message: error.message };
  }
  if (error instanceof ZodError) {
    return { status: 400, message: error.issues[0]?.message ?? "Datos inválidos." };
  }
  const esPrisma = error instanceof Error && error.constructor.name.startsWith("PrismaClient");
  if (error instanceof Error && !esPrisma && prismaErrorCode(error) === null && error.message) {
    return { status: 400, message: error.message.slice(0, LARGO_MAXIMO_MENSAJE) };
  }
  console.error("Error no controlado", error);
  return { status: 500, message: fallback };
}

function prismaErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}
