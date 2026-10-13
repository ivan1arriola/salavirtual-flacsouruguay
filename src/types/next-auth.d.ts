import type { RolUsuario } from "@/src/modules/usuarios/roles";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    internalUserId?: string;
    role: RolUsuario;
    mustChangePassword: boolean;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: RolUsuario;
      mustChangePassword: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: RolUsuario;
    mustChangePassword?: boolean;
  }
}
