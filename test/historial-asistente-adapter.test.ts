import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

describe("historial operativo del asistente", () => {
  it("recupera asignaciones y desvinculaciones de las reuniones del período", async () => {
    const moduleUrl = new URL("../src/modules/asistencia/historial-asistente.adapter.ts", import.meta.url);
    const modulePath = fileURLToPath(moduleUrl);
    expect(existsSync(modulePath)).toBe(true);
    if (!existsSync(modulePath)) return;

    const adapter = await vi.importActual<any>(moduleUrl.href);
    const db = {
      asistenteTecnico: { findUnique: vi.fn().mockResolvedValue({ id: "at-1" }) },
      asignacionAsistenciaTecnica: { findMany: vi.fn().mockResolvedValue([
        { instanciaSalaId: "inst-1", instancia: { inicioProgramadoAt: new Date("2026-09-04T21:00:00Z"), solicitud: { titulo: "Retórica y Hermenéutica" } } }
      ]) },
      auditoria: { findMany: vi.fn().mockResolvedValue([
        { id: "h2", accion: "ASISTENTE_DESVINCULADO", entidadId: "inst-1", valorAnterior: { asistenteTecnicoId: "at-1" }, valorNuevo: { asistenteTecnicoId: "at-1" }, createdAt: new Date("2026-09-05T01:00:00Z"), actor: { nombres: "Ana", apellidos: "Pérez" } },
        { id: "h1", accion: "ASISTENTE_ASIGNADO", entidadId: "inst-1", valorAnterior: null, valorNuevo: { asistenteTecnicoId: "at-1" }, createdAt: new Date("2026-09-02T14:00:00Z"), actor: { nombres: "Ana", apellidos: "Pérez" } }
      ]) }
    } as unknown as PrismaClient;

    const history = await adapter.obtenerHistorialAsistenteEnRango(db, "usuario-at", {
      desde: new Date("2026-09-01T03:00:00Z"),
      hasta: new Date("2026-10-01T03:00:00Z")
    });

    expect(history.map((item: any) => item.accion)).toEqual(["DESVINCULADO", "ASIGNADO"]);
    expect(history.every((item: any) => item.titulo === "Retórica y Hermenéutica" && item.actor === "Ana Pérez")).toBe(true);
  });
});
