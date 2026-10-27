/**
 * Atribución de correos a participantes de Meet.
 *
 * La API de Meet no expone el correo de las cuentas (solo `users/<id>`), y la
 * Reports API no expone el ID de participante de Meet. La única clave común es
 * el intervalo de cada sesión: ambas APIs registran el mismo ingreso y egreso
 * con una diferencia inferior a 2 s (Reports trunca a milisegundos).
 *
 * Reglas conservadoras:
 * - nunca se usa el nombre;
 * - solo cuentan eventos Reports con `identifier_type=email_address`;
 * - inicio y fin deben coincidir dentro de la tolerancia (1 s por defecto);
 * - una sesión con candidatos de correos distintos no vota;
 * - un participante cuyas sesiones votan por correos distintos queda sin asignar.
 */
export type SesionParaCorreo = Readonly<{ participanteId?: string; inicio: string; fin: string }>;
export type EventoParaCorreo = Readonly<{
  identificador: string;
  tipoIdentificador: string;
  inicio: string;
  fin: string;
}>;

export type AtribucionCorreos = Readonly<{
  correoPorParticipante: ReadonlyMap<string, string>;
  participantesAmbiguos: readonly string[];
}>;

export const TOLERANCIA_CORREO_MS = 1000;

function correoValido(value: string): string | null {
  const candidate = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

export function atribuirCorreosPorHorario(
  sesiones: readonly SesionParaCorreo[],
  eventos: readonly EventoParaCorreo[],
  toleranciaMs: number = TOLERANCIA_CORREO_MS
): AtribucionCorreos {
  const candidatos = eventos.flatMap(evento => {
    const correo = evento.tipoIdentificador === "email_address" ? correoValido(evento.identificador) : null;
    const inicio = Date.parse(evento.inicio), fin = Date.parse(evento.fin);
    return correo && Number.isFinite(inicio) && Number.isFinite(fin) ? [{ correo, inicio, fin }] : [];
  });

  const votos = new Map<string, Set<string>>();
  const ambiguos = new Set<string>();
  for (const sesion of sesiones) {
    const id = sesion.participanteId?.trim();
    const inicio = Date.parse(sesion.inicio), fin = Date.parse(sesion.fin);
    if (!id || !Number.isFinite(inicio) || !Number.isFinite(fin)) continue;
    const correos = new Set(candidatos
      .filter(c => Math.abs(c.inicio - inicio) <= toleranciaMs && Math.abs(c.fin - fin) <= toleranciaMs)
      .map(c => c.correo));
    if (correos.size === 0) continue;
    if (correos.size > 1) { ambiguos.add(id); continue; }
    votos.set(id, new Set([...(votos.get(id) ?? []), ...correos]));
  }

  const correoPorParticipante = new Map<string, string>();
  for (const [id, correos] of votos) {
    if (correos.size === 1 && !ambiguos.has(id)) correoPorParticipante.set(id, [...correos][0]!);
    else ambiguos.add(id);
  }
  return { correoPorParticipante, participantesAmbiguos: [...ambiguos].sort() };
}
