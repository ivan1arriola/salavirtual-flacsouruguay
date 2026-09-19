import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { obtenerServicioIdentity } from "@/src/bootstrap/identity.server";
import { authConfig } from "@/src/lib/auth/config";
import {
  esRolUsuario,
  resolverRedireccionAutorizada
} from "@/src/modules/identity/api";

const identity = obtenerServicioIdentity();

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: authConfig.secret,
  trustHost: authConfig.trustHost,
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/acceso",
    error: "/acceso"
  },
  providers: [
    Credentials({
      name: "Usuario y contrasena",
      credentials: {
        usuario: { label: "Usuario", type: "text" },
        password: { label: "Contrasena", type: "password" }
      },
      authorize: async (credentials) => {
        const usuario = await identity.autenticarCredenciales(credentials);
        if (!usuario) {
          return null;
        }

        return {
          id: usuario.id,
          name: usuario.nombre,
          email: usuario.email,
          role: usuario.rol,
          mustChangePassword: usuario.debeCambiarPassword
        };
      }
    }),
    ...(authConfig.google
      ? [
          Google({
            clientId: authConfig.google.clientId,
            clientSecret: authConfig.google.clientSecret,
            profile: async (profile) => {
              const usuario = await identity.resolverUsuarioGoogle({
                subject: profile.sub,
                email: profile.email,
                emailVerificado: profile.email_verified,
                nombre: profile.name,
                nombres: profile.given_name,
                apellidos: profile.family_name
              });
              if (!usuario) {
                throw new Error("La cuenta Google todavía no tiene acceso autorizado.");
              }

              return {
                id: usuario.id,
                name: usuario.nombre,
                email: usuario.email,
                image: profile.picture,
                role: usuario.rol,
                mustChangePassword: usuario.debeCambiarPassword
              };
            }
          })
        ]
      : [])
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = user.role;
        token.mustChangePassword = user.mustChangePassword;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.userId ?? token.sub ?? "");
        session.user.role = esRolUsuario(token.role) ? token.role : "DOCENTE";
        session.user.mustChangePassword = token.mustChangePassword === true;
      }
      return session;
    },
    redirect({ url }) {
      return resolverRedireccionAutorizada(url, authConfig.baseUrl);
    }
  }
});
