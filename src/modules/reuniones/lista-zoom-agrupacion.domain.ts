/** Un par de colores por cuenta: el mismo en la lista (CSS) y en el detalle. Una prueba exige que coincidan. */
export const PALETA_CUENTAS_ZOOM: readonly Readonly<{ fuerte: string; palido: string }>[] = [
  { fuerte: "#2563eb", palido: "#eff4ff" },
  { fuerte: "#dc2626", palido: "#fff1f1" },
  { fuerte: "#16a34a", palido: "#eefaf2" },
  { fuerte: "#d97706", palido: "#fff7e8" },
  { fuerte: "#7c3aed", palido: "#f5f0ff" },
  { fuerte: "#0891b2", palido: "#ecfafd" },
  { fuerte: "#db2777", palido: "#fff0f7" },
  { fuerte: "#4d7c0f", palido: "#f4f9e8" },
  { fuerte: "#ea580c", palido: "#fff2ea" },
  { fuerte: "#0f766e", palido: "#ebf8f6" },
  { fuerte: "#475569", palido: "#f1f5f9" },
  { fuerte: "#92400e", palido: "#fbf3ec" }
];

export const TAMANO_PALETA_CUENTAS = PALETA_CUENTAS_ZOOM.length;

const ZONA_MONTEVIDEO = "America/Montevideo";
const PATRON_SALA = /^sala(\d+)@/;

const partesDiaMontevideo = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_MONTEVIDEO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const etiquetaDiaMontevideo = new Intl.DateTimeFormat("es-UY", {
  timeZone: ZONA_MONTEVIDEO,
  weekday: "long",
  day: "numeric",
  month: "long"
});

export type RelativoDiaZoom = "HOY" | "MANANA" | null;

export type GrupoDiaZoom<T> = Readonly<{
  clave: string;
  etiqueta: string;
  relativo: RelativoDiaZoom;
  items: readonly T[];
}>;

export type CuentaPresenteZoom = Readonly<{
  correo: string;
  nombre: string;
  color: number;
}>;

function hashEstable(texto: string): number {
  return [...texto].reduce((acumulado, caracter) => (acumulado * 31 + caracter.charCodeAt(0)) >>> 0, 7);
}

/** Nombre corto de una cuenta anfitriona (parte local del correo, p. ej. `sala02`). */
export function nombreCuentaZoom(correo: string): string {
  const limpio = correo.trim();
  const indiceArroba = limpio.indexOf("@");
  return indiceArroba > 0 ? limpio.slice(0, indiceArroba).toLowerCase() : limpio;
}

/** Índice de paleta estable (0 a TAMANO_PALETA_CUENTAS - 1) para una cuenta de Zoom, o null si no hay cuenta. */
export function colorCuentaZoom(correo: string | null | undefined): number | null {
  const normalizado = correo?.trim().toLowerCase() ?? "";
  if (!normalizado) {
    return null;
  }

  const coincidenciaSala = PATRON_SALA.exec(normalizado);
  if (coincidenciaSala) {
    const numero = Number.parseInt(coincidenciaSala[1] ?? "", 10);
    if (Number.isFinite(numero) && numero >= 1) {
      return (numero - 1) % TAMANO_PALETA_CUENTAS;
    }
  }

  return hashEstable(normalizado) % TAMANO_PALETA_CUENTAS;
}

function extraerPartesDia(instante: Date): Readonly<{
  anio: number;
  mes: number;
  dia: number;
  clave: string;
}> {
  const partes = partesDiaMontevideo.formatToParts(instante);
  const valor = (tipo: "year" | "month" | "day") =>
    partes.find((parte) => parte.type === tipo)?.value ?? "00";
  const anioTexto = valor("year");
  const mesTexto = valor("month");
  const diaTexto = valor("day");

  return {
    anio: Number.parseInt(anioTexto, 10),
    mes: Number.parseInt(mesTexto, 10),
    dia: Number.parseInt(diaTexto, 10),
    clave: `${anioTexto}-${mesTexto}-${diaTexto}`
  };
}

function claveDiaSiguiente(partes: Readonly<{ anio: number; mes: number; dia: number }>): string {
  return new Date(Date.UTC(partes.anio, partes.mes - 1, partes.dia + 1)).toISOString().slice(0, 10);
}

/** Agrupa elementos consecutivos del mismo día calendario en America/Montevideo sin alterar el orden de entrada. */
export function agruparPorDia<T>(
  items: readonly T[],
  fecha: (item: T) => Date,
  ahora: Date
): readonly GrupoDiaZoom<T>[] {
  const hoy = extraerPartesDia(ahora);
  const claveManana = claveDiaSiguiente(hoy);

  return items.reduce<readonly GrupoDiaZoom<T>[]>((grupos, item) => {
    const instante = fecha(item);
    const { clave } = extraerPartesDia(instante);
    const ultimo = grupos[grupos.length - 1];

    if (ultimo && ultimo.clave === clave) {
      return [...grupos.slice(0, -1), { ...ultimo, items: [...ultimo.items, item] }];
    }

    const relativo: RelativoDiaZoom = clave === hoy.clave ? "HOY" : clave === claveManana ? "MANANA" : null;

    return [
      ...grupos,
      {
        clave,
        etiqueta: etiquetaDiaMontevideo.format(instante),
        relativo,
        items: [item]
      }
    ];
  }, []);
}

function compararCuentas(a: CuentaPresenteZoom, b: CuentaPresenteZoom): number {
  const porNombre = a.nombre.localeCompare(b.nombre, "es-UY", {
    numeric: true,
    sensitivity: "base"
  });
  return porNombre !== 0 ? porNombre : a.correo.localeCompare(b.correo, "es-UY");
}

function insertarOrdenada(
  ordenadas: readonly CuentaPresenteZoom[],
  nueva: CuentaPresenteZoom
): readonly CuentaPresenteZoom[] {
  const indice = ordenadas.findIndex((actual) => compararCuentas(nueva, actual) < 0);
  return indice < 0
    ? [...ordenadas, nueva]
    : [...ordenadas.slice(0, indice), nueva, ...ordenadas.slice(indice)];
}

/** Cuentas únicas presentes en la página, ordenadas por nombre local, con su índice de color. */
export function cuentasPresentes(
  correos: readonly (string | null | undefined)[]
): readonly CuentaPresenteZoom[] {
  const unicas = correos.reduce<readonly CuentaPresenteZoom[]>((acumulado, valor) => {
    const limpio = valor?.trim() ?? "";
    if (!limpio) {
      return acumulado;
    }

    const claveUnica = limpio.toLowerCase();
    if (acumulado.some((existente) => existente.correo.toLowerCase() === claveUnica)) {
      return acumulado;
    }

    const correo = limpio.includes("@") ? claveUnica : limpio;
    const color = colorCuentaZoom(correo);
    if (color === null) {
      return acumulado;
    }

    return [
      ...acumulado,
      {
        correo,
        nombre: nombreCuentaZoom(correo),
        color
      }
    ];
  }, []);

  return unicas.reduce<readonly CuentaPresenteZoom[]>(insertarOrdenada, []);
}

export type ResumenCuentasAnfitrionas = Readonly<{
  tipo: "NINGUNA" | "UNA" | "VARIAS";
  correos: readonly string[];
}>;

/** Cuentas anfitrionas distintas de una serie, en orden de aparición. */
export function resumenCuentasAnfitrionas(
  correos: readonly (string | null | undefined)[]
): ResumenCuentasAnfitrionas {
  const distintas = correos.reduce<readonly string[]>((acumulado, valor) => {
    const limpio = valor?.trim() ?? "";
    return limpio && !acumulado.includes(limpio) ? [...acumulado, limpio] : acumulado;
  }, []);
  return {
    tipo: distintas.length === 0 ? "NINGUNA" : distintas.length === 1 ? "UNA" : "VARIAS",
    correos: distintas
  };
}
