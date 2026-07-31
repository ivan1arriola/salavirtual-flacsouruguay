import type { RolUsuario } from "@/src/modules/usuarios/roles";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: RolUsuario;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: RolUsuario;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: RolUsuario;
  }
}
