import type {
  CuentaGoogleVinculada,
  PerfilGoogle,
  UsuarioCredenciales
} from "../domain/identity.types";

export type IdentityRepository = Readonly<{
  buscarParaLoginLocal: (identificador: string) => Promise<UsuarioCredenciales | null>;
  registrarAcceso: (
    usuarioId: string,
    proveedor: "credentials" | "google",
    fecha?: Date
  ) => Promise<void>;
  resolverOCrearCuentaGoogle: (
    perfil: PerfilGoogle,
    fecha: Date
  ) => Promise<CuentaGoogleVinculada | null>;
  actualizarUltimoAccesoGoogle: (
    cuentaId: string,
    subject: string,
    fecha: Date
  ) => Promise<void>;
}>;
