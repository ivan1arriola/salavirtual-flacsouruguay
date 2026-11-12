export type CuentaCalendarioAsistente = Readonly<{
  id: string;
  email: string;
  dominio: string;
  providerAccountId: string | null;
  emailVerificadoAt: Date | null;
}>;

export type UsuarioAsignadoCalendario = Readonly<{
  rol: string;
  activo: boolean;
  fusionadoEnId: string | null;
  cuentasGoogle: readonly CuentaCalendarioAsistente[];
}>;

export type AsignacionCalendarioAsistente = Readonly<{
  id: string;
  estado: string;
  asistenteTecnico: Readonly<{
    usuario: UsuarioAsignadoCalendario;
  }>;
}>;

export type SnapshotCalendarioAsistente = Readonly<{
  estado: string;
  requiereAsistenciaTecnica: boolean;
  vigente?: boolean;
  asignaciones: readonly AsignacionCalendarioAsistente[];
}>;

export type PlanCalendarioAsistente = Readonly<{
  publicar: readonly Readonly<{ cuenta: CuentaCalendarioAsistente; eventId: string }>[];
  eliminar: readonly Readonly<{ cuenta: CuentaCalendarioAsistente; eventId: string }>[];
}>;

export type ResultadoSincronizacionCalendarioAsistente = Readonly<{
  cuentaGoogleId: string;
  email: string;
  accion: "PUBLICAR" | "ELIMINAR";
  estado: "SINCRONIZADA" | "ERROR";
  error?: string;
}>;

export type IntentoSincronizacionCalendarioAsistente = Readonly<{
  resultados: readonly ResultadoSincronizacionCalendarioAsistente[];
  error: string | null;
}>;
