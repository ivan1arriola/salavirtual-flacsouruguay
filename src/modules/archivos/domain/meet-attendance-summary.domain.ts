export type IntervaloAsistencia = Readonly<{ inicio: string; fin: string }>;
export type ResumenIntervalosAsistencia = Readonly<{
  primeraConexion: string | null;
  ultimaDesconexion: string | null;
  minutosConectados: number;
  porcentaje: number;
  cumpleCincoSextos: boolean;
  conexiones: number;
}>;
type IntervaloMs = Readonly<{ desde: number; hasta: number }>;
const resumenVacio: ResumenIntervalosAsistencia = {
  primeraConexion: null,
  ultimaDesconexion: null,
  minutosConectados: 0,
  porcentaje: 0,
  cumpleCincoSextos: false,
  conexiones: 0,
};
export function normalizarCodigoMeet(codigo: string): string {
  return codigo
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s-]+/g, "");
}
export function resumirIntervalosAsistencia(
  intervalos: readonly IntervaloAsistencia[],
  inicioProgramadoAt: Date,
  finProgramadoAt: Date,
): ResumenIntervalosAsistencia {
  const inicioHorario = inicioProgramadoAt.getTime();
  const finHorario = finProgramadoAt.getTime();
  if (
    !Number.isFinite(inicioHorario) ||
    !Number.isFinite(finHorario) ||
    finHorario <= inicioHorario
  ) {
    return resumenVacio;
  }
  const recortadosSinOrden: readonly IntervaloMs[] = intervalos.flatMap(({ inicio, fin }) => {
    const inicioMs = Date.parse(inicio),
      finMs = Date.parse(fin);
    const desde = Math.max(inicioMs, inicioHorario),
      hasta = Math.min(finMs, finHorario);
    return Number.isFinite(inicioMs) && Number.isFinite(finMs) && hasta > desde
      ? [{ desde, hasta }]
      : [];
  });
  const recortados = recortadosSinOrden.reduce<readonly IntervaloMs[]>((acc, current) => {
    const index = acc.findIndex(
      (item) =>
        item.desde > current.desde || (item.desde === current.desde && item.hasta > current.hasta),
    );
    const position = index < 0 ? acc.length : index;
    return [...acc.slice(0, position), current, ...acc.slice(position)];
  }, []);
  const unidos = recortados.reduce<readonly IntervaloMs[]>((acc, intervalo) => {
    const anterior = acc.at(-1);
    return anterior && intervalo.desde <= anterior.hasta
      ? [
          ...acc.slice(0, -1),
          { desde: anterior.desde, hasta: Math.max(anterior.hasta, intervalo.hasta) },
        ]
      : [...acc, intervalo];
  }, []);
  if (!unidos.length) {
    return resumenVacio;
  }
  const totalMs = unidos.reduce((total, item) => total + item.hasta - item.desde, 0);
  const duracionMs = finHorario - inicioHorario;
  const porcentaje = Math.min(100, Math.max(0, (totalMs / duracionMs) * 100));
  return {
    primeraConexion: new Date(unidos[0]!.desde).toISOString(),
    ultimaDesconexion: new Date(unidos.at(-1)!.hasta).toISOString(),
    minutosConectados: Math.round(totalMs / 60_000),
    porcentaje: Math.round(porcentaje * 100) / 100,
    cumpleCincoSextos: totalMs / duracionMs >= 5 / 6,
    conexiones: recortados.length,
  };
}
