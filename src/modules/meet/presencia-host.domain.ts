export type ParticipanteDetectado = Readonly<{
  nombre: string;
  email?: string;
  user?: string;
  tipo?: string;
}>;

export type InputHostsEsperados = Readonly<{
  cuentaProveedorEmail?: string | null;
  docenteEmail?: string | null;
  docenteNombre?: string | null;
  creadorEmail?: string | null;
  creadorNombre?: string | null;
  responsableNombre?: string | null;
  cohostEmails?: readonly string[];
  asistenteEmail?: string | null;
  asistenteNombre?: string | null;
}>;

export type ResultadoEvaluacionPresencia = Readonly<{
  hostConectado: boolean;
  participanteMatch?: string;
  totalConectados: number;
}>;

export function evaluarVentanaVerificacionPresencia(
  inicioProgramadoAt: Date,
  ahora: Date,
  minutosAntes = 10,
  minutosDespues = 5
): boolean {
  const diffMs = inicioProgramadoAt.getTime() - ahora.getTime();
  const maxAntesMs = minutosAntes * 60 * 1000;
  const maxDespuesMs = minutosDespues * 60 * 1000;
  return diffMs <= maxAntesMs && diffMs >= -maxDespuesMs;
}

export function extraerEmailsYNombresEsperados(input: InputHostsEsperados): Readonly<{
  emails: readonly string[];
  nombres: readonly string[];
}> {
  const rawEmails = [
    input.cuentaProveedorEmail,
    input.docenteEmail,
    input.creadorEmail,
    ...(input.cohostEmails ?? []),
    input.asistenteEmail
  ];
  const rawNombres = [
    input.docenteNombre,
    input.creadorNombre,
    input.responsableNombre,
    input.asistenteNombre
  ];

  const emails = Array.from(
    new Set(
      rawEmails
        .filter((val): val is string => Boolean(val && val.trim().length > 0))
        .map((email) => email.trim().toLowerCase())
    )
  );

  const nombres = Array.from(
    new Set(
      rawNombres
        .filter((val): val is string => Boolean(val && val.trim().length > 0))
        .map((nombre) => nombre.trim().toLowerCase())
    )
  );

  return { emails, nombres };
}

export function evaluarPresenciaHost(
  participantesConectados: readonly ParticipanteDetectado[],
  hostsEsperados: InputHostsEsperados
): ResultadoEvaluacionPresencia {
  const { emails, nombres } = extraerEmailsYNombresEsperados(hostsEsperados);
  const totalConectados = participantesConectados.length;

  if (totalConectados === 0) {
    return { hostConectado: false, totalConectados: 0 };
  }

  const match = participantesConectados.find((p) => {
    const pEmail = p.email?.trim().toLowerCase();
    const pNombre = p.nombre?.trim().toLowerCase();

    if (pEmail && emails.includes(pEmail)) return true;
    if (pNombre) {
      if (nombres.some((n) => pNombre.includes(n) || n.includes(pNombre))) return true;
      if (emails.some((e) => pNombre.includes(e))) return true;
    }
    return false;
  });

  if (match) {
    return {
      hostConectado: true,
      participanteMatch: match.nombre || match.email || "Host detectado",
      totalConectados
    };
  }

  return {
    hostConectado: false,
    totalConectados
  };
}

export function debeNotificarHostAusente(input: Readonly<{
  hostConectado: boolean;
  yaNotificado: boolean;
  estaEnVentana: boolean;
  estadoInstancia: string;
}>): boolean {
  if (input.estadoInstancia !== "PROGRAMADA") return false;
  if (input.yaNotificado) return false;
  if (!input.estaEnVentana) return false;
  return !input.hostConectado;
}
