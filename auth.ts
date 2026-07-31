import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { authConfig } from "@/src/lib/auth/config";
import { resolverUsuarioGoogle } from "@/src/lib/auth/google-login.adapter";
import { dependenciasLoginLocal } from "@/src/lib/auth/local-login.adapter";
import { resolverRedireccionAutorizada } from "@/src/modules/usuarios/auth-config.domain";
import { autenticarConCredenciales } from "@/src/modules/usuarios/credentials.service";
import { esRolUsuario } from "@/src/modules/usuarios/roles";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: authConfig.secret,
  trustHost: authConfig.trustHost,
  session: {
    strategy: "jwt"
  },
  providers: [
    Credentials({
      name: "Usuario y contrasena",
      credentials: {
        usuario: { label: "Usuario", type: "text" },
        password: { label: "Contrasena", type: "password" }
      },
      authorize: async (credentials) => {
        const usuario = await autenticarConCredenciales(dependenciasLoginLocal, credentials);
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
              const usuario = await resolverUsuarioGoogle({
                subject: profile.sub,
                email: profile.email,
                emailVerificado: profile.email_verified
              });
              if (!usuario) {
                throw new Error("La cuenta Google no esta vinculada a un usuario activo.");
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
