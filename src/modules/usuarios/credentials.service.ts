import {
  credencialesLoginSchema,
  evaluarAccesoLocal,
  type UsuarioAutenticado,
  type UsuarioCredenciales
} from "./credentials.domain";

export type DependenciasLogin = Readonly<{
  buscarUsuario: (identificador: string) => Promise<UsuarioCredenciales | null>;
  verificarPassword: (password: string, passwordHash: string) => Promise<boolean>;
  registrarAcceso: (usuarioId: string) => Promise<void>;
}>;

export async function autenticarConCredenciales(
  dependencias: DependenciasLogin,
  input: unknown
): Promise<UsuarioAutenticado | null> {
  const parsed = credencialesLoginSchema.safeParse(input);
  if (!parsed.success) {
    return null;
  }

  const usuario = await dependencias.buscarUsuario(parsed.data.usuario);
  if (!usuario) {
    return null;
  }

  const passwordValida = usuario.passwordHash
    ? await dependencias.verificarPassword(parsed.data.password, usuario.passwordHash)
    : false;
  const autenticado = evaluarAccesoLocal(usuario, passwordValida);
  if (!autenticado) {
    return null;
  }

  await dependencias.registrarAcceso(autenticado.id);
  return autenticado;
}
