import { compare } from "bcryptjs";
import { db } from "@/src/lib/db";
import { crearPrismaIdentityAdapter, type UsuarioCredenciales } from "@/src/modules/identity/api";

export type DependenciasLogin = Readonly<{
  buscarUsuario: (identificador: string) => Promise<UsuarioCredenciales | null>;
  verificarPassword: (password: string, passwordHash: string) => Promise<boolean>;
  registrarAcceso: (usuarioId: string) => Promise<void>;
}>;

const repo = crearPrismaIdentityAdapter(db);

export const dependenciasLoginLocal: DependenciasLogin = Object.freeze({
  buscarUsuario: (identificador) => repo.buscarParaLoginLocal(identificador),
  verificarPassword: compare,
  registrarAcceso: (usuarioId) => repo.registrarAcceso(usuarioId, "credentials")
});
