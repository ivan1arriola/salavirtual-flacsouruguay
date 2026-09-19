import {
  credencialesLoginSchema,
  evaluarAccesoLocal,
  type UsuarioAutenticado
} from "../domain";
import type { IdentityRepository } from "../ports";

export type PasswordVerifier = (password: string, hash: string) => Promise<boolean>;

export function crearAutenticarCredencialesUseCase(
  repository: IdentityRepository,
  verificarPassword: PasswordVerifier
) {
  return async function autenticarCredenciales(
    input: unknown
  ): Promise<UsuarioAutenticado | null> {
    const parsed = credencialesLoginSchema.safeParse(input);
    if (!parsed.success) {
      return null;
    }

    const usuario = await repository.buscarParaLoginLocal(parsed.data.usuario);
    if (!usuario) {
      return null;
    }

    const passwordValida = usuario.passwordHash
      ? await verificarPassword(parsed.data.password, usuario.passwordHash)
      : false;

    const autenticado = evaluarAccesoLocal(usuario, passwordValida);
    if (!autenticado) {
      return null;
    }

    await repository.registrarAcceso(autenticado.id, "credentials");
    return autenticado;
  };
}
