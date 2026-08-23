import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  destinatariosDocentesPrograma,
  puedeGestionarPrograma
} from "../src/modules/reuniones/permisos-programa.service";

describe("permisos de reuniones compartidas por programa", () => {
  it("permite Administración sin consultar asociaciones docentes", async () => {
    const findFirst = vi.fn();
    const db = { docentePrograma: { findFirst } } as unknown as PrismaClient;

    await expect(puedeGestionarPrograma(
      db,
      { id: "admin", rol: "ADMINISTRACION", activo: true },
      "programa"
    )).resolves.toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("permite al docente cuando tiene una asociación activa con el programa", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "docente-programa" });
    const db = { docentePrograma: { findFirst } } as unknown as PrismaClient;

    await expect(puedeGestionarPrograma(
      db,
      { id: "docente", rol: "DOCENTE", activo: true },
      "programa"
    )).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledOnce();
  });

  it("rechaza docentes ajenos al programa y usuarios inactivos", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const db = { docentePrograma: { findFirst } } as unknown as PrismaClient;

    await expect(puedeGestionarPrograma(
      db,
      { id: "otro-docente", rol: "DOCENTE", activo: true },
      "programa"
    )).resolves.toBe(false);
    await expect(puedeGestionarPrograma(
      db,
      { id: "docente", rol: "DOCENTE", activo: false },
      "programa"
    )).resolves.toBe(false);
  });

  it("deduplica destinatarios docentes del mismo programa", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { docente: { usuario: { id: "d1", emailPrincipal: "d1@flacso.edu.uy" } } },
      { docente: { usuario: { id: "d1", emailPrincipal: "d1@flacso.edu.uy" } } },
      { docente: { usuario: { id: "d2", emailPrincipal: "d2@flacso.edu.uy" } } }
    ]);
    const db = { docentePrograma: { findMany } } as unknown as PrismaClient;

    await expect(destinatariosDocentesPrograma(db, "programa")).resolves.toEqual([
      { usuarioId: "d1", email: "d1@flacso.edu.uy" },
      { usuarioId: "d2", email: "d2@flacso.edu.uy" }
    ]);
  });
});
