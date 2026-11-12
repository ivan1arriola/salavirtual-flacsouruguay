import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  gestionarCoberturaSchema,
  validarIntervaloRetroactivo
} from "@/src/modules/asistencia/domain/gestion-cobertura.domain";

const read = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("gestión de cobertura y retroactividad", () => {
  it("distingue convocatoria, asignación directa, carga y revisión retroactiva", () => {
    expect(
      gestionarCoberturaSchema.parse({
        accion: "CONVOCAR",
        instanciaSalaId: "inst-1"
      }).accion
    ).toBe("CONVOCAR");
    expect(
      gestionarCoberturaSchema.parse({
        accion: "ASIGNAR_DIRECTO",
        instanciaSalaId: "inst-1",
        asistenteTecnicoId: "asis-1"
      }).accion
    ).toBe("ASIGNAR_DIRECTO");
    expect(
      gestionarCoberturaSchema.parse({
        accion: "REGISTRAR_RETROACTIVO",
        instanciaSalaId: "inst-1",
        asistenteTecnicoId: "asis-1",
        inicioRealAt: "2026-10-18T11:00:00-03:00",
        finRealAt: "2026-10-18T13:00:00-03:00",
        motivo: "Cobertura realizada sin asignación previa"
      }).accion
    ).toBe("REGISTRAR_RETROACTIVO");
    expect(
      gestionarCoberturaSchema.parse({
        accion: "APROBAR_RETROACTIVO",
        registroId: "retro-1"
      }).accion
    ).toBe("APROBAR_RETROACTIVO");
    expect(
      gestionarCoberturaSchema.parse({
        accion: "RECHAZAR_RETROACTIVO",
        registroId: "retro-1",
        motivo: "Horas incorrectas"
      }).accion
    ).toBe("RECHAZAR_RETROACTIVO");
  });

  it("rechaza horario retroactivo invertido, excesivo y futuro", () => {
    const encuentro = {
      inicio: new Date("2026-10-18T11:00:00-03:00"),
      fin: new Date("2026-10-18T13:00:00-03:00")
    };
    const ahora = new Date("2026-10-19T11:00:00-03:00");
    expect(
      validarIntervaloRetroactivo(
        new Date("2026-10-18T10:45:00-03:00"),
        new Date("2026-10-18T13:15:00-03:00"),
        encuentro,
        ahora
      )
    ).toBe(150);
    expect(() => validarIntervaloRetroactivo(encuentro.fin, encuentro.inicio, encuentro, ahora)).toThrow();
    expect(() =>
      validarIntervaloRetroactivo(
        new Date("2026-10-17T10:00:00-03:00"),
        new Date("2026-10-18T12:00:00-03:00"),
        encuentro,
        ahora
      )
    ).toThrow();
    expect(() =>
      validarIntervaloRetroactivo(encuentro.inicio, new Date("2026-10-20T12:00:00-03:00"), encuentro, ahora)
    ).toThrow();
  });

  it("requiere autorización administrativa y no permite pagos sin aprobación", () => {
    const service = read("src/modules/asistencia/gestion-cobertura.service.ts");
    const schema = read("prisma/schema.prisma");
    const report = read(
      "src/modules/liquidaciones/infrastructure/prisma/prisma-liquidaciones-repository.adapter.ts"
    );
    expect(service).toContain('actor.rol !== "ADMINISTRACION"');
    expect(service).toContain('estado: "PENDIENTE"');
    expect(service).toContain('accion === "RECHAZAR_RETROACTIVO"');
    expect(service).toContain('"MONITOREO_RETROACTIVO_APROBADO"');
    expect(service).toContain("liquidacionAsistenciaTecnica.findFirst");
    expect(schema).toContain("model RegistroMonitoreoRetroactivo");
    expect(report).toContain('estado: { in: ["ASIGNADO", "ACEPTADO"] }');
    expect(service).toContain('estado: "ACEPTADO"');
  });

  it("solo en convocatoria abierta notifica al grupo de asistentes", () => {
    const service = read("src/modules/asistencia/gestion-cobertura.service.ts");
    expect(service).toContain('input.accion === "CONVOCAR"');
    expect(service).toContain("renotificarAsistentesDisponibles");
    expect(service).toContain("notificarUsuario(db, result.person");
    expect(service).not.toContain("notificarUsuarios(db, result.person");
  });

  it("incluye acceso desde cada encuentro, pasado o futuro, y pantalla de revisión", () => {
    const meeting = read("src/modules/reuniones/presentation/components/meeting-detail-manager.tsx");
    const panel = read("src/modules/asistencia/presentation/components/gestion-cobertura-panel.tsx");
    const page = read("app/(gestion)/monitoreo/gestionar/[instanciaId]/page.tsx");
    expect(meeting).toContain("/monitoreo/gestionar/${meeting.id}");
    expect(panel).toContain("ASIGNAR_DIRECTO");
    expect(panel).toContain("CONVOCAR");
    expect(panel).toContain("REGISTRAR_RETROACTIVO");
    expect(panel).toContain("APROBAR_RETROACTIVO");
    expect(panel).toContain("RECHAZAR_RETROACTIVO");
    expect(page).toContain('actor.rol !== "ADMINISTRACION"');
  });

  it("el endpoint no sincroniza proveedores en encuentros históricos", () => {
    const route = read("app/api/v1/asistencia/gestion-cobertura/route.ts");
    expect(route).toContain('result.accion === "CONVOCAR" || result.accion === "ASIGNAR_DIRECTO"');
    expect(route).toContain("sincronizarAsignacionAsistente");
    expect(route).toContain('result.accion === "REGISTRAR_RETROACTIVO"');
  });
});
