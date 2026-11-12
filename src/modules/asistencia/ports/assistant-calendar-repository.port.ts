import type { AsignacionCalendarioAsistente } from "../domain";

export type InstanciaParaCalendario = Readonly<{
  id: string;
  estado: string;
  requiereAsistenciaTecnica: boolean;
  inicioProgramadoAt: Date;
  finProgramadoAt: Date;
  inicioAsistenciaTecnicaAt: Date | null;
  finAsistenciaTecnicaAt: Date | null;
  modalidad: "HIBRIDA" | "VIRTUAL";
  timezone: string;
  descripcion: string | null;
  solicitudTitulo: string;
  solicitudDescripcion: string | null;
  programaNombre: string | null;
  docenteNombreCompleto: string | null;
  joinUrl: string | null;
  asignaciones: readonly AsignacionCalendarioAsistente[];
}>;

export type CredencialesWorkspaceCalendar = Readonly<{
  serviceAccountEmail: string;
  privateKey: string;
}>;

export type AssistantCalendarRepositoryPort = Readonly<{
  obtenerInstanciaParaCalendario: (instanciaSalaId: string) => Promise<InstanciaParaCalendario | null>;

  obtenerInstanciasDeSolicitud: (solicitudSalaId: string) => Promise<readonly string[]>;

  obtenerInstanciasDeAsistente: (usuarioId: string) => Promise<readonly string[]>;

  obtenerInstanciasFuturasParaReconciliar: (now: Date) => Promise<readonly string[]>;

  obtenerCredencialesWorkspace: () => Promise<CredencialesWorkspaceCalendar | null>;
}>;
