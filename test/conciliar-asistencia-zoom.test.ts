/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import {
  calcularCambioConciliacionZoom,
  proponerSugerenciasConciliacionZoom,
  puedeConciliarAsistenciaZoom
} from "../src/modules/archivos/domain/conciliacion-asistencia-zoom.domain";
import { conciliarAsistenciaZoomUseCase } from "../src/modules/archivos/application/conciliar-asistencia-zoom.use-case";
import type { ContextoConciliacionZoom } from "../src/modules/archivos/ports";

const ctx = (extra: Partial<ContextoConciliacionZoom> = {}): ContextoConciliacionZoom => ({
  registroId: "r1",
  version: 2,
  claveParticipante: "id:p1",
  instanciaId: "i1",
  titularUsuarioId: "titular",
  estadoConciliacion: "SIN_CONCILIAR",
  invitadoReunionId: null,
  esExterno: null,
  ...extra
});
const admin = { id: "a", rol: "ADMINISTRACION" as const };
const titular = { id: "titular", rol: "DOCENTE" as const };
const otroDocente = { id: "otro", rol: "DOCENTE" as const };
const asistente = { id: "as", rol: "ASISTENTE_TECNICO" as const };

describe("permisos de conciliación", () => {
  it("solo administración y el docente titular de la serie concilian", () => {
    expect(puedeConciliarAsistenciaZoom(admin, ctx())).toBe(true);
    expect(puedeConciliarAsistenciaZoom(titular, ctx())).toBe(true);
    expect(puedeConciliarAsistenciaZoom(otroDocente, ctx())).toBe(false);
    expect(puedeConciliarAsistenciaZoom(asistente, ctx())).toBe(false);
    expect(puedeConciliarAsistenciaZoom({ id: "x", rol: "DOCENTE" }, ctx({ titularUsuarioId: null }))).toBe(
      false
    );
  });
});

describe("cambio de conciliación", () => {
  it("vincular, marcar externo y quitar vínculo son operaciones explícitas y excluyentes", () => {
    expect(calcularCambioConciliacionZoom({ invitadoReunionId: "inv", externo: false })).toEqual({
      estadoConciliacion: "CONCILIADO",
      invitadoReunionId: "inv",
      esExterno: false
    });
    expect(calcularCambioConciliacionZoom({ invitadoReunionId: null, externo: true })).toEqual({
      estadoConciliacion: "EXTERNO",
      invitadoReunionId: null,
      esExterno: true
    });
    expect(calcularCambioConciliacionZoom({ invitadoReunionId: null, externo: false })).toEqual({
      estadoConciliacion: "SIN_CONCILIAR",
      invitadoReunionId: null,
      esExterno: null
    });
    expect(calcularCambioConciliacionZoom({ invitadoReunionId: "inv", externo: true })).toBeNull();
  });
});

describe("conciliarAsistenciaZoomUseCase", () => {
  function crear(
    contexto: ContextoConciliacionZoom | null,
    aplicar: any = vi.fn(async () => ({ tipo: "APLICADO", version: 3 }))
  ) {
    const repo = { obtenerContexto: vi.fn(async () => contexto), aplicar };
    return {
      repo,
      ejecutar: (actor: any, extra: any = {}) =>
        conciliarAsistenciaZoomUseCase({ repo }, actor, {
          registroId: "r1",
          invitadoReunionId: "inv",
          externo: false,
          version: 2,
          ...extra
        })
    };
  }

  it("un actor sin permiso recibe PROHIBIDO y no se escribe nada", async () => {
    for (const actor of [otroDocente, asistente]) {
      const { repo, ejecutar } = crear(ctx());
      expect(await ejecutar(actor)).toEqual({ tipo: "PROHIBIDO" });
      expect(repo.aplicar).not.toHaveBeenCalled();
    }
  });

  it("administración y titular concilian pasando la versión leída y el actor", async () => {
    const { repo, ejecutar } = crear(ctx());
    expect(await ejecutar(titular)).toEqual({ tipo: "OK", version: 3 });
    expect(repo.aplicar).toHaveBeenCalledWith(
      "r1",
      2,
      { estadoConciliacion: "CONCILIADO", invitadoReunionId: "inv", esExterno: false },
      "titular"
    );
  });

  it("versión desactualizada: CONFLICTO sin escribir", async () => {
    const { repo, ejecutar } = crear(ctx({ version: 5 }));
    expect(await ejecutar(admin)).toEqual({ tipo: "CONFLICTO" });
    expect(repo.aplicar).not.toHaveBeenCalled();
  });

  it("conflicto detectado por el repositorio al escribir (edición simultánea)", async () => {
    const { ejecutar } = crear(
      ctx(),
      vi.fn(async () => ({ tipo: "CONFLICTO" }))
    );
    expect(await ejecutar(admin)).toEqual({ tipo: "CONFLICTO" });
  });

  it("invitado de otro encuentro: se rechaza", async () => {
    const { ejecutar } = crear(
      ctx(),
      vi.fn(async () => ({ tipo: "INVITADO_AJENO" }))
    );
    expect(await ejecutar(admin)).toEqual({ tipo: "ERROR", codigo: "INVITADO_AJENO" });
  });

  it("un registro que no pertenece al encuentro de la URL se trata como inexistente", async () => {
    const { repo, ejecutar } = crear(ctx({ instanciaId: "i1" }));
    expect(await ejecutar(admin, { instanciaId: "otra" })).toEqual({
      tipo: "ERROR",
      codigo: "NO_ENCONTRADO"
    });
    expect(repo.aplicar).not.toHaveBeenCalled();
    expect(await ejecutar(admin, { instanciaId: "i1" })).toMatchObject({ tipo: "OK" });
  });

  it("registro inexistente y petición contradictoria", async () => {
    expect(await crear(null).ejecutar(admin)).toEqual({ tipo: "ERROR", codigo: "NO_ENCONTRADO" });
    expect(await crear(ctx()).ejecutar(admin, { externo: true })).toEqual({
      tipo: "ERROR",
      codigo: "PETICION_INVALIDA"
    });
  });
});

describe("sugerencias dentro de la serie", () => {
  const previo = (clave: string, email: string) => ({ claveParticipante: clave, email });
  const invitados = [
    { id: "i-ana", email: "ana@flacso.edu.uy" },
    { id: "i-luis", email: "luis@flacso.edu.uy" }
  ];

  it("sugiere solo con identificador fiable y un invitado de este encuentro con el mismo correo del vínculo previo", () => {
    const r = proponerSugerenciasConciliacionZoom(
      [{ registroId: "r1", claveParticipante: "id:p1" }],
      [previo("id:p1", "Ana@Flacso.edu.uy")],
      invitados
    );
    expect(r).toEqual([{ registroId: "r1", invitadoReunionId: "i-ana" }]);
  });

  it("nunca para sesiones sin identificador fiable; ni con vínculo previo ambiguo o sin invitado", () => {
    expect(
      proponerSugerenciasConciliacionZoom(
        [{ registroId: "r1", claveParticipante: "sesion:abc" }],
        [previo("sesion:abc", "ana@flacso.edu.uy")],
        invitados
      )
    ).toEqual([]);
    expect(
      proponerSugerenciasConciliacionZoom(
        [{ registroId: "r1", claveParticipante: "id:p1" }],
        [previo("id:p1", "ana@flacso.edu.uy"), previo("id:p1", "luis@flacso.edu.uy")],
        invitados
      )
    ).toEqual([]);
    expect(
      proponerSugerenciasConciliacionZoom(
        [{ registroId: "r1", claveParticipante: "id:p1" }],
        [previo("id:p1", "nadie@x.com")],
        invitados
      )
    ).toEqual([]);
  });

  it("no usa el mismo invitado para dos registros distintos", () => {
    const r = proponerSugerenciasConciliacionZoom(
      [
        { registroId: "r1", claveParticipante: "id:p1" },
        { registroId: "r2", claveParticipante: "id:p2" }
      ],
      [previo("id:p1", "ana@flacso.edu.uy"), previo("id:p2", "ana@flacso.edu.uy")],
      invitados
    );
    expect(r).toEqual([]);
  });
});
