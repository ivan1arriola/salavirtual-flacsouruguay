export type EstadoTemporalReunion = "EN_VIVO" | "PROXIMA_HOY" | "FUTURA" | "FINALIZADA";

export interface HeroMeetingDTO {
  readonly id: string;
  readonly solicitudId: string;
  readonly titulo: string;
  readonly programa: string;
  readonly modalidad: "HIBRIDA" | "VIRTUAL";
  readonly inicioProgramadoAt: string;
  readonly finProgramadoAt: string;
  readonly joinUrl: string | null;
  readonly cohostConfirmado: boolean;
  readonly cohosts: readonly { readonly name: string; readonly email: string }[];
  readonly asistente: { readonly id: string; readonly nombre: string } | null;
  readonly requiereAsistencia: boolean;
  readonly salaNombre: string | null;
}

export interface UpcomingMeetingSummaryDTO {
  readonly id: string;
  readonly solicitudId: string;
  readonly titulo: string;
  readonly programa: string;
  readonly modalidad: "HIBRIDA" | "VIRTUAL";
  readonly inicioProgramadoAt: string;
  readonly finProgramadoAt: string;
  readonly joinUrl: string | null;
  readonly estadoTemporal: EstadoTemporalReunion;
  readonly asistenteNombre: string | null;
  readonly requiereAsistencia: boolean;
  readonly cohostsVerificados: boolean;
}

export interface TriageAttentionItemDTO {
  readonly key: string;
  readonly tone: "danger" | "warning" | "neutral";
  readonly count: number;
  readonly title: string;
  readonly details: readonly string[];
  readonly href: string;
  readonly actionLabel: string;
}

export interface RecentRecordingDTO {
  readonly id: string;
  readonly titulo: string;
  readonly programa: string;
  readonly fecha: string;
  readonly duracionMinutos: number | null;
  readonly driveUrl: string | null;
  readonly publicUrl: string | null;
}

export interface AssistantOpportunityDTO {
  readonly id: string;
  readonly solicitudId: string;
  readonly titulo: string;
  readonly programa: string;
  readonly modalidad: "HIBRIDA" | "VIRTUAL";
  readonly inicioProgramadoAt: string;
  readonly finProgramadoAt: string;
  readonly yaPostulado: boolean;
}

export interface AssistantDashboardData {
  readonly heroMeeting: HeroMeetingDTO | null;
  readonly upcomingCoverages: readonly UpcomingMeetingSummaryDTO[];
  readonly openOpportunities: readonly AssistantOpportunityDTO[];
  readonly stats: {
    readonly currentMonthMinutes: number;
    readonly currentMonthVirtualMinutes: number;
    readonly currentMonthHybridMinutes: number;
    readonly previousMonthMinutes: number;
    readonly previousMonthVirtualMinutes: number;
    readonly previousMonthHybridMinutes: number;
    readonly postulacionesCount: number;
    readonly pendientesRespuesta: number;
    readonly respondidas: number;
    readonly reunionesDisponibles: number;
  };
}
