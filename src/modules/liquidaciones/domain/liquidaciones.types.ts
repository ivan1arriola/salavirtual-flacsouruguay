export type ModalidadAsistencia = "VIRTUAL" | "HIBRIDA";

export type TarifaVigente = Readonly<{
  id: string;
  valorHora: number;
  moneda: string;
}>;

export type MontoMoneda = Readonly<{
  moneda: string;
  monto: number;
}>;

export type PeriodoMes = Readonly<{
  clave: string;
  desdeMs: number;
  hastaMs: number;
  anterior: string;
  siguiente: string;
}>;

export type PeriodoReporteMensual = Readonly<{
  clave: string;
  desdeMs: number;
  hastaMs: number;
}>;

export type FilaPlanillaPago = Readonly<{
  asistente: string;
  programa: string;
  reunion: string;
  fecha: Date;
  minutos: number;
  modalidad: ModalidadAsistencia;
  tarifaHora: number | null;
  montoConfirmado: number | null;
  montoCalculado: number | null;
  moneda: string;
}>;

export type ResumenAsistencia = Readonly<{
  reuniones: number;
  minutosVirtuales: number;
  minutosHibridos: number;
  montoVirtual: number;
  montoHibrido: number;
  monto: number;
}>;

export type AsistenteResumenBase = Readonly<{
  id: string;
  usuarioId: string;
  slug: string;
  nombre: string;
  email: string | null;
  activo: boolean;
}>;

export type AsignacionResumenAdministracion = Readonly<{
  asistenteTecnicoId: string;
  modalidad: ModalidadAsistencia;
  minutos: number;
  monto: number | null;
  moneda: string;
}>;

export type FilaResumenAsistente = AsistenteResumenBase &
  Readonly<{
    reuniones: number;
    virtuales: number;
    hibridas: number;
    minutos: number;
    montos: readonly MontoMoneda[];
    sinTarifa: number;
  }>;

export type TotalesResumen = Readonly<{
  asistentes: number;
  reuniones: number;
  minutos: number;
  montos: readonly MontoMoneda[];
  sinTarifa: number;
}>;

export type CorreoReporteMensual = Readonly<{
  subject: string;
  text: string;
  html: string;
}>;

export type RegistroAsistenciaLiquidacion = Readonly<{
  modalidad: ModalidadAsistencia;
  minutos: number;
  monto: number | null;
}>;
