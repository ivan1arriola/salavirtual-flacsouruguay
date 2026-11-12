import { describe, expect, it } from "vitest";
import {
  nombreArchivoZoom,
  normalizarInventarioZoom
} from "../src/modules/archivos/domain/zoom-archivos.domain";
import {
  PREFIJO_REFERENCIA_ARCHIVO_ZOOM,
  asignarNombresDestinoZoom,
  bytesTransferidosReservaAbandonadaZoom,
  estadoInicialArchivoZoom,
  estadoTrasReinventarioZoom,
  evaluarCupoTransferenciaZoom,
  multiplicidadesAmbiguasZoom,
  referenciaExternaArchivoZoom,
  sanearErrorZoom,
  tipoArchivoReunionZoom
} from "../src/modules/archivos/domain/zoom-inventario-estado.domain";
import type {
  ArchivoOrigenZoom,
  ReferenciaOcurrenciaZoom
} from "../src/modules/archivos/domain/zoom-archivos.types";

const GB = 1024n ** 3n;
const hash = (texto: string) => `h(${texto})`;
const ocurrencia: ReferenciaOcurrenciaZoom = {
  cuentaZoomId: "cta-1",
  uuid: "uuid/ab==",
  meetingId: "123",
  anfitrionZoomId: "host-1",
  inicioRealAt: new Date("2026-03-05T14:00:00Z"),
  titulo: "Clase 1"
};
const archivo = (extra: Partial<ArchivoOrigenZoom> = {}): ArchivoOrigenZoom => ({
  claveOrigen: "clave-1",
  archivoZoomId: "f1",
  coleccion: "recording_files",
  tipoOriginal: "MP4",
  variante: "gallery_view",
  extension: "mp4",
  inicioAt: null,
  finAt: null,
  tamanoBytes: null,
  estadoOrigen: "completed",
  descargable: true,
  ...extra
});

describe("estado inicial y reinventario", () => {
  it("un recurso descargable queda PENDIENTE; en proceso PROCESANDO_ORIGEN; sin descarga DESCUBIERTO con motivo", () => {
    expect(estadoInicialArchivoZoom(archivo(), 1)).toEqual({ estado: "PENDIENTE", errorCodigo: null });
    expect(estadoInicialArchivoZoom(archivo({ descargable: false, estadoOrigen: "processing" }), 1)).toEqual({
      estado: "PROCESANDO_ORIGEN",
      errorCodigo: null
    });
    expect(estadoInicialArchivoZoom(archivo({ descargable: false, estadoOrigen: null }), 1)).toEqual({
      estado: "DESCUBIERTO",
      errorCodigo: "SIN_DESCARGA_DISPONIBLE"
    });
  });

  it("una identidad ambigua queda REQUIERE_REVISION y nunca se transfiere como si fuera única", () => {
    expect(estadoInicialArchivoZoom(archivo(), 2)).toEqual({
      estado: "REQUIERE_REVISION",
      errorCodigo: "IDENTIDAD_AMBIGUA"
    });
  });

  it("extrae la multiplicidad de las observaciones IDENTIDAD_AMBIGUA del dominio", () => {
    const r = normalizarInventarioZoom(
      ocurrencia,
      {
        recording_files: [
          {
            file_type: "CHAT",
            file_extension: "TXT",
            recording_start: "2026-03-05T14:00:00Z",
            status: "completed",
            download_url: "https://x/a"
          },
          {
            file_type: "CHAT",
            file_extension: "TXT",
            recording_start: "2026-03-05T14:00:00Z",
            status: "completed",
            download_url: "https://x/b"
          }
        ]
      },
      hash
    );
    const mapa = multiplicidadesAmbiguasZoom(r.observaciones);
    expect(r.recursos).toHaveLength(1);
    expect(mapa.get(r.recursos[0].claveOrigen)).toBe(2);
    expect(multiplicidadesAmbiguasZoom([{ tipo: "ELEMENTO_INVALIDO", coleccion: "x", indice: 0 }]).size).toBe(
      0
    );
  });

  it("nunca resetea CONSERVADO ni COPIANDO al reinventariar", () => {
    for (const actual of ["CONSERVADO", "COPIANDO"] as const) {
      expect(estadoTrasReinventarioZoom(actual, archivo(), 1)).toBeNull();
      expect(estadoTrasReinventarioZoom(actual, archivo(), 3)).toBeNull();
    }
  });

  it("promueve DESCUBIERTO/PROCESANDO_ORIGEN cuando Zoom termina de procesar y respeta estados del worker", () => {
    expect(estadoTrasReinventarioZoom("PROCESANDO_ORIGEN", archivo(), 1)).toEqual({
      estado: "PENDIENTE",
      errorCodigo: null
    });
    expect(estadoTrasReinventarioZoom("DESCUBIERTO", archivo(), 1)).toEqual({
      estado: "PENDIENTE",
      errorCodigo: null
    });
    expect(
      estadoTrasReinventarioZoom("DESCUBIERTO", archivo({ descargable: false, estadoOrigen: null }), 1)
    ).toBeNull();
    expect(estadoTrasReinventarioZoom("PENDIENTE", archivo(), 1)).toBeNull();
    expect(estadoTrasReinventarioZoom("ERROR_REINTENTABLE", archivo(), 1)).toBeNull();
    expect(estadoTrasReinventarioZoom("REQUIERE_REVISION", archivo(), 1)).toBeNull();
  });

  it("marca revisión si aparece ambigüedad en un recurso aún no transferido", () => {
    expect(estadoTrasReinventarioZoom("PENDIENTE", archivo(), 2)).toEqual({
      estado: "REQUIERE_REVISION",
      errorCodigo: "IDENTIDAD_AMBIGUA"
    });
    expect(estadoTrasReinventarioZoom("REQUIERE_REVISION", archivo(), 2)).toBeNull();
  });
});

describe("nombres de destino sin colisiones dentro de la ocurrencia", () => {
  it("los IDs a/b y a-b sanean igual y se desambiguan con la clave de origen", () => {
    const a = archivo({ archivoZoomId: "a/b", claveOrigen: "k-aaaaaaaaaaaaaaaa" });
    const b = archivo({ archivoZoomId: "a-b", claveOrigen: "k-bbbbbbbbbbbbbbbb" });
    expect(nombreArchivoZoom(ocurrencia, a)).toBe(nombreArchivoZoom(ocurrencia, b));
    const nombres = asignarNombresDestinoZoom(ocurrencia, [b, a], []);
    expect(nombres.get(a.claveOrigen)).toEqual({
      nombre: "2026-03-05_MP4_gallery_view_a-b.mp4",
      desambiguado: false,
      colision: false
    });
    expect(nombres.get(b.claveOrigen)).toEqual({
      nombre: "2026-03-05_MP4_gallery_view_a-b_k-bbbbbbbbbb.mp4",
      desambiguado: true,
      colision: false
    });
  });

  it("detecta colisiones por truncamiento, Unicode NFC y mayúsculas contra nombres ya persistidos", () => {
    const largo = "x".repeat(60);
    const a = archivo({ archivoZoomId: `${largo}1`, claveOrigen: "k1" });
    const persistido = nombreArchivoZoom(ocurrencia, archivo({ archivoZoomId: `${largo}2` }));
    expect(nombreArchivoZoom(ocurrencia, a)).toBe(persistido);
    expect(asignarNombresDestinoZoom(ocurrencia, [a], [persistido]).get("k1")).toMatchObject({
      desambiguado: true
    });

    const nfd = archivo({ archivoZoomId: null, variante: "Ñandú".normalize("NFD"), claveOrigen: "k2" });
    const ocupado = nombreArchivoZoom(ocurrencia, nfd).normalize("NFD").toUpperCase();
    const asignado = asignarNombresDestinoZoom(ocurrencia, [nfd], [ocupado]).get("k2");
    expect(asignado?.desambiguado).toBe(true);
    expect(asignado?.nombre.normalize("NFC").toLowerCase()).not.toBe(ocupado.normalize("NFC").toLowerCase());
  });

  it("si todas las variantes están ocupadas usa un contador y lo señala como colisión", () => {
    const a = archivo({ claveOrigen: "kk" });
    const base = nombreArchivoZoom(ocurrencia, a);
    const ocupados = [base, nombreArchivoZoom(ocurrencia, a, "kk")];
    const asignado = asignarNombresDestinoZoom(ocurrencia, [a], ocupados).get("kk");
    expect(asignado).toEqual({
      nombre: nombreArchivoZoom(ocurrencia, a, "kk-2"),
      desambiguado: true,
      colision: true
    });
  });

  it("el sufijo no puede introducir separadores de ruta", () => {
    expect(nombreArchivoZoom(ocurrencia, archivo(), "../x/y")).toBe("2026-03-05_MP4_gallery_view_f1_x-y.mp4");
  });
});

describe("referencias, tipos y errores saneados", () => {
  it("la referencia externa no expone la cuenta ni el UUID y usa el prefijo Zoom compartido", () => {
    expect(referenciaExternaArchivoZoom("cta-1", "uuid/ab==", "clave-1", hash)).toBe(
      "zoom/h(cta-1)/h(uuid/ab==)/clave-1"
    );
    expect(PREFIJO_REFERENCIA_ARCHIVO_ZOOM).toBe("zoom/");
  });

  it("una reserva abandonada cuenta solo lo confirmado durante su intento", () => {
    expect(bytesTransferidosReservaAbandonadaZoom(10n * GB, 25n * GB)).toBe(15n * GB);
    expect(bytesTransferidosReservaAbandonadaZoom(10n * GB, 10n * GB)).toBe(0n);
    expect(bytesTransferidosReservaAbandonadaZoom(10n * GB, 0n)).toBe(0n);
  });

  it("clasifica el tipo local sin presentar audios ni auxiliares como el video principal", () => {
    expect(tipoArchivoReunionZoom("mp4")).toBe("GRABACION");
    expect(tipoArchivoReunionZoom("TRANSCRIPT")).toBe("TRANSCRIPCION");
    expect(tipoArchivoReunionZoom("CC")).toBe("TRANSCRIPCION");
    expect(tipoArchivoReunionZoom("AUDIO_TRANSCRIPT")).toBe("TRANSCRIPCION");
    expect(tipoArchivoReunionZoom("SUMMARY")).toBe("NOTAS");
    for (const tipo of ["M4A", "CHAT", "TIMELINE", "CSV", "HOLOGRAMA"]) {
      expect(tipoArchivoReunionZoom(tipo)).toBe("OTRO");
    }
  });

  it("elimina URLs firmadas, tokens y credenciales y acota la longitud", () => {
    const texto =
      "fallo GET https://ssrweb.zoom.us/rec/download/abc?access_token=SECRETO&x=1 con Bearer eyJabc.def " +
      "token=OTRO signature=FIRMA";
    const limpio = sanearErrorZoom(texto)!;
    expect(limpio).not.toMatch(/SECRETO|eyJabc|OTRO|FIRMA|ssrweb/);
    expect(limpio).toContain("[url]");
    expect(sanearErrorZoom("x".repeat(900))!.length).toBe(500);
    expect(sanearErrorZoom("   ")).toBeNull();
    expect(sanearErrorZoom(null)).toBeNull();
  });
});

describe("cupo de transferencia en ventana móvil", () => {
  const ahora = new Date("2026-11-08T12:00:00Z");
  const limites = { topeBytes: 80n * GB, reservaRecienteBytes: 20n * GB, ventanaMs: 24 * 3_600_000 };
  const hace = (horas: number) => new Date(ahora.getTime() - horas * 3_600_000);

  it("admite mientras la suma de 24 h más la nueva no supera el tope", () => {
    const reservas = [{ reservadoAt: hace(2), bytes: 29n * GB }];
    expect(evaluarCupoTransferenciaZoom(reservas, 50n * GB, "RECIENTE", limites, ahora)).toMatchObject({
      cabe: true
    });
    expect(
      evaluarCupoTransferenciaZoom(
        [{ reservadoAt: hace(2), bytes: 79n * GB }],
        1n * GB,
        "RECIENTE",
        limites,
        ahora
      )
    ).toMatchObject({ cabe: true });
  });

  it("rechaza y estima la liberación con marcas exactas", () => {
    const reservas = [
      { reservadoAt: hace(1), bytes: 29n * GB },
      { reservadoAt: hace(23), bytes: 30n * GB }
    ];
    const r = evaluarCupoTransferenciaZoom(reservas, 50n * GB, "RECIENTE", limites, ahora);
    expect(r).toEqual({
      cabe: false,
      usadoBytes: 59n * GB,
      limiteBytes: 80n * GB,
      disponibleBytes: 21n * GB,
      liberacionEstimadaAt: new Date(hace(23).getTime() + limites.ventanaMs)
    });
    const lleno = evaluarCupoTransferenciaZoom(
      [{ reservadoAt: hace(2), bytes: 79n * GB }],
      50n * GB,
      "RECIENTE",
      limites,
      ahora
    );
    expect(lleno).toMatchObject({
      cabe: false,
      disponibleBytes: 1n * GB,
      liberacionEstimadaAt: new Date(hace(2).getTime() + limites.ventanaMs)
    });
  });

  it("una reserva sale de la ventana exactamente a las 24 h", () => {
    const reservas = [{ reservadoAt: hace(24), bytes: 80n * GB }];
    expect(evaluarCupoTransferenciaZoom(reservas, 50n * GB, "RECIENTE", limites, ahora)).toMatchObject({
      cabe: true,
      usadoBytes: 0n
    });
  });

  it("el histórico no consume la reserva para encuentros recientes", () => {
    const reservas = [{ reservadoAt: hace(1), bytes: 30n * GB }];
    expect(evaluarCupoTransferenciaZoom(reservas, 30n * GB, "HISTORICO", limites, ahora)).toMatchObject({
      cabe: true,
      limiteBytes: 60n * GB
    });
    expect(evaluarCupoTransferenciaZoom(reservas, 31n * GB, "HISTORICO", limites, ahora)).toMatchObject({
      cabe: false
    });
    expect(evaluarCupoTransferenciaZoom(reservas, 31n * GB, "RECIENTE", limites, ahora)).toMatchObject({
      cabe: true
    });
  });

  it("un archivo mayor que el límite aplicable nunca cabe y no inventa una fecha", () => {
    expect(evaluarCupoTransferenciaZoom([], 61n * GB, "HISTORICO", limites, ahora)).toMatchObject({
      cabe: false,
      liberacionEstimadaAt: null
    });
  });

  it("rechaza parámetros inválidos", () => {
    expect(() => evaluarCupoTransferenciaZoom([], -1n, "RECIENTE", limites, ahora)).toThrow(RangeError);
    expect(() =>
      evaluarCupoTransferenciaZoom([], 1n, "RECIENTE", { ...limites, ventanaMs: 0 }, ahora)
    ).toThrow(RangeError);
    expect(() =>
      evaluarCupoTransferenciaZoom([], 1n, "RECIENTE", { ...limites, reservaRecienteBytes: 90n * GB }, ahora)
    ).toThrow(RangeError);
  });
});
