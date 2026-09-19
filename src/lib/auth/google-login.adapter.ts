import { obtenerServicioIdentity } from "@/src/bootstrap/identity.server";
import type { PerfilGoogle } from "@/src/modules/identity/api";

export async function resolverUsuarioGoogle(perfil: PerfilGoogle) {
  return obtenerServicioIdentity().resolverUsuarioGoogle(perfil);
}
