import type { RolUsuario } from "./roles";

export type AsociacionProgramaFusion = Readonly<{
  id: string;
  programaId: string;
}>;

export type UsuarioParaFusion = Readonly<{
  id: string;
  rol: RolUsuario;
  activo: boolean;
  fusionadoEnId: string | null;
  docenteId: string | null;
  programas: readonly AsociacionProgramaFusion[];
  emailPrincipal: string | null;
  aliases: readonly string[];
}>;

export type ActorFusion = Readonly<{
  rol: RolUsuario;
  activo: boolean;
}>;

export type AccionProgramaFusion =
  | Readonly<{
      tipo: "COMBINAR_ASOCIACION";
      asociacionOrigenId: string;
      asociacionDestinoId: string;
    }>
  | Readonly<{
      tipo: "REASIGNAR_ASOCIACION";
      asociacionOrigenId: string;
      docenteDestinoId: string;
    }>;

export type PlanFusionDocentes = Readonly<{
  accionesProgramas: readonly AccionProgramaFusion[];
  emailPrincipalComoAlias: string | null;
}>;

export type ErrorFusionDocentes =
  | "ACTOR_NO_AUTORIZADO"
  | "MISMO_USUARIO"
  | "ORIGEN_NO_DISPONIBLE"
  | "DESTINO_NO_DISPONIBLE"
  | "ROL_NO_DOCENTE"
  | "PERFIL_DOCENTE_FALTANTE";

export type Resultado<T, E> =
  | Readonly<{ ok: true; valor: T }>
  | Readonly<{ ok: false; error: E }>;

export function planificarFusionDocentes(
  actor: ActorFusion,
  origen: UsuarioParaFusion,
  destino: UsuarioParaFusion
): Resultado<PlanFusionDocentes, ErrorFusionDocentes> {
  if (!actor.activo || actor.rol !== "ADMINISTRACION") {
    return { ok: false, error: "ACTOR_NO_AUTORIZADO" };
  }
  if (origen.id === destino.id) {
    return { ok: false, error: "MISMO_USUARIO" };
  }
  if (!origen.activo || origen.fusionadoEnId) {
    return { ok: false, error: "ORIGEN_NO_DISPONIBLE" };
  }
  if (!destino.activo || destino.fusionadoEnId) {
    return { ok: false, error: "DESTINO_NO_DISPONIBLE" };
  }
  if (origen.rol !== "DOCENTE" || destino.rol !== "DOCENTE") {
    return { ok: false, error: "ROL_NO_DOCENTE" };
  }
  if (!origen.docenteId || !destino.docenteId) {
    return { ok: false, error: "PERFIL_DOCENTE_FALTANTE" };
  }

  const docenteDestinoId = destino.docenteId;
  const asociacionesDestino = new Map(
    destino.programas.map((asociacion) => [asociacion.programaId, asociacion.id] as const)
  );
  const accionesProgramas = origen.programas.map<AccionProgramaFusion>((asociacion) => {
    const asociacionDestinoId = asociacionesDestino.get(asociacion.programaId);
    return asociacionDestinoId
      ? {
          tipo: "COMBINAR_ASOCIACION",
          asociacionOrigenId: asociacion.id,
          asociacionDestinoId
        }
      : {
          tipo: "REASIGNAR_ASOCIACION",
          asociacionOrigenId: asociacion.id,
          docenteDestinoId
        };
  });
  const conservarEmail =
    origen.emailPrincipal !== null &&
    origen.emailPrincipal !== destino.emailPrincipal &&
    !origen.aliases.includes(origen.emailPrincipal);

  return {
    ok: true,
    valor: {
      accionesProgramas,
      emailPrincipalComoAlias: conservarEmail ? origen.emailPrincipal : null
    }
  };
}
