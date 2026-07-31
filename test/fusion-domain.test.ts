import { describe, expect, it } from "vitest";
import {
  planificarFusionDocentes,
  type ActorFusion,
  type UsuarioParaFusion
} from "../src/modules/usuarios/fusion.domain";

const actorAdministracion: ActorFusion = {
  rol: "ADMINISTRACION",
  activo: true
};

const docente = (
  valores: Partial<UsuarioParaFusion> & Pick<UsuarioParaFusion, "id">
): UsuarioParaFusion => ({
  rol: "DOCENTE",
  activo: true,
  fusionadoEnId: null,
  docenteId: `docente-${valores.id}`,
  programas: [],
  emailPrincipal: null,
  aliases: [],
  ...valores,
  id: valores.id
});

describe("planificacion funcional de fusion de docentes", () => {
  it("combina asociaciones repetidas y reasigna las restantes", () => {
    const resultado = planificarFusionDocentes(
      actorAdministracion,
      docente({
        id: "origen",
        programas: [
          { id: "origen-a", programaId: "programa-a" },
          { id: "origen-b", programaId: "programa-b" }
        ]
      }),
      docente({
        id: "destino",
        programas: [{ id: "destino-a", programaId: "programa-a" }]
      })
    );

    expect(resultado).toEqual({
      ok: true,
      valor: {
        accionesProgramas: [
          {
            tipo: "COMBINAR_ASOCIACION",
            asociacionOrigenId: "origen-a",
            asociacionDestinoId: "destino-a"
          },
          {
            tipo: "REASIGNAR_ASOCIACION",
            asociacionOrigenId: "origen-b",
            docenteDestinoId: "docente-destino"
          }
        ],
        emailPrincipalComoAlias: null
      }
    });
  });

  it("rechaza una fusion que no sea entre docentes activos", () => {
    const resultado = planificarFusionDocentes(
      actorAdministracion,
      docente({ id: "origen", activo: false }),
      docente({ id: "destino" })
    );

    expect(resultado).toEqual({ ok: false, error: "ORIGEN_NO_DISPONIBLE" });
  });

  it("conserva el correo principal anterior como alias", () => {
    const resultado = planificarFusionDocentes(
      actorAdministracion,
      docente({ id: "origen", emailPrincipal: "anterior@flacso.edu.uy" }),
      docente({ id: "destino", emailPrincipal: "actual@flacso.edu.uy" })
    );

    expect(resultado.ok && resultado.valor.emailPrincipalComoAlias).toBe(
      "anterior@flacso.edu.uy"
    );
  });

  it("rechaza actores sin permisos de administracion", () => {
    const resultado = planificarFusionDocentes(
      { rol: "DOCENTE", activo: true },
      docente({ id: "origen" }),
      docente({ id: "destino" })
    );

    expect(resultado).toEqual({ ok: false, error: "ACTOR_NO_AUTORIZADO" });
  });
});
