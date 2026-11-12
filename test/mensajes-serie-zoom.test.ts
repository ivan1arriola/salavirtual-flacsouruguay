import { describe, expect, it } from "vitest";
import type { ResultadoCorreccionSerie } from "@/src/modules/reuniones/corregir-serie-enlaces.service";
import type { ResultadoMigracionSerie } from "@/src/modules/reuniones/migracion-zoom-serie-aplicar.service";
import {
  describirResultadoSerie,
  type MensajeResultadoSerie
} from "@/src/modules/reuniones/mensajes-serie-zoom.domain";

const RESULTADOS_SIN_ERROR = ["MIGRADA", "CORREGIDA", "YA_ZOOM", "YA_UNIFICADA", "OMITIDA"] as const;

const ETAPAS_ERROR = [
  "VALIDACION",
  "ZOOM",
  "CALENDAR",
  "CAMBIO_PROVEEDOR",
  "VINCULACION",
  "AVISOS",
  "FINAL"
] as const;

const PATRON_TECNICO = /prisma|ConnectorError|PostgresError|22021|invalid byte sequence/i;

function validarMensajeComprensible(msg: MensajeResultadoSerie) {
  expect(msg.titulo.trim().length).toBeGreaterThan(0);
  expect(msg.detalle.trim().length).toBeGreaterThan(0);
  expect(msg.accionSugerida.trim().length).toBeGreaterThan(0);
  expect(msg.titulo).not.toMatch(PATRON_TECNICO);
  expect(msg.detalle).not.toMatch(PATRON_TECNICO);
  expect(msg.accionSugerida).not.toMatch(PATRON_TECNICO);
}

describe("describirResultadoSerie", () => {
  it.each(RESULTADOS_SIN_ERROR)(
    "devuelve mensaje claro sin detalleTecnico para resultado %s",
    (resultado) => {
      const msg = describirResultadoSerie({
        resultado,
        etapa: "FINAL",
        reintentable: false
      });

      validarMensajeComprensible(msg);
      expect(msg.reintentable).toBe(false);
      expect(msg.detalleTecnico).toBeUndefined();
    }
  );

  it("produce mensajes distintos para cada resultado exitoso u omitido", () => {
    const titulos = new Set(
      RESULTADOS_SIN_ERROR.map((resultado) => describirResultadoSerie({ resultado }).titulo)
    );
    expect(titulos.size).toBe(RESULTADOS_SIN_ERROR.length);
  });

  it.each(ETAPAS_ERROR)("devuelve mensaje claro por etapa %s cuando el resultado es ERROR", (etapa) => {
    const textoOriginal = `Fallo simulado en ${etapa}`;
    const msg = describirResultadoSerie({
      resultado: "ERROR",
      etapa,
      mensaje: textoOriginal,
      reintentable: true
    });

    validarMensajeComprensible(msg);
    expect(msg.reintentable).toBe(true);
    expect(msg.detalleTecnico).toBe(textoOriginal);
  });

  it("produce mensajes distintos para cada etapa de ERROR", () => {
    const detalles = new Set(
      ETAPAS_ERROR.map(
        (etapa) =>
          describirResultadoSerie({
            resultado: "ERROR",
            etapa,
            mensaje: "Fallo temporal",
            reintentable: true
          }).detalle
      )
    );
    expect(detalles.size).toBe(ETAPAS_ERROR.length);
  });

  it("marca reintentable false y conserva detalleTecnico ante error 22021 de Prisma/Postgres", () => {
    const errorPrisma22021 =
      'Invalid `prisma.reunionProveedor.findUnique()` invocation: ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "22021", message: "invalid byte sequence for encoding \\"UTF8\\": 0x00", severity: "ERROR", detail: None, column: None, hint: None }), transient: false })';

    const msg = describirResultadoSerie({
      resultado: "ERROR",
      etapa: "FINAL",
      mensaje: errorPrisma22021,
      reintentable: true
    });

    validarMensajeComprensible(msg);
    expect(msg.reintentable).toBe(false);
    expect(msg.detalleTecnico).toBe(errorPrisma22021);
  });

  it.each([
    "Error 22021 en consulta",
    "ERROR: INVALID BYTE SEQUENCE for encoding UTF8",
    "La clave de la serie no es válida.",
    "Hay un encuentro a menos de 24 horas del inicio."
  ])("fuerza reintentable false cuando el mensaje contiene texto no reintentable (%s)", (mensaje) => {
    const msg = describirResultadoSerie({
      resultado: "ERROR",
      etapa: "VALIDACION",
      mensaje,
      reintentable: true
    });

    validarMensajeComprensible(msg);
    expect(msg.reintentable).toBe(false);
    expect(msg.detalleTecnico).toBe(mensaje);
  });

  it("respeta reintentable false cuando el servicio lo indica aunque el texto no esté en la lista", () => {
    const msg = describirResultadoSerie({
      resultado: "ERROR",
      etapa: "ZOOM",
      mensaje: "Zoom devolvió un enlace de acceso inválido.",
      reintentable: false
    });

    validarMensajeComprensible(msg);
    expect(msg.reintentable).toBe(false);
    expect(msg.detalleTecnico).toBe("Zoom devolvió un enlace de acceso inválido.");
  });

  it.each(["ZOOM", "CALENDAR"] as const)(
    "conserva reintentable true en un error transitorio de %s",
    (etapa) => {
      const msg = describirResultadoSerie({
        resultado: "ERROR",
        etapa,
        mensaje: "Tiempo de espera agotado al contactar el servicio externo.",
        reintentable: true
      });

      validarMensajeComprensible(msg);
      expect(msg.reintentable).toBe(true);
      expect(msg.detalleTecnico).toBe("Tiempo de espera agotado al contactar el servicio externo.");
    }
  );

  it("acepta estructuralmente ResultadoMigracionSerie y ResultadoCorreccionSerie", () => {
    const migracion: ResultadoMigracionSerie = {
      serieClave: "sol:1",
      resultado: "MIGRADA",
      etapa: "FINAL",
      reintentable: false,
      encuentros: 4
    };
    const correccion: ResultadoCorreccionSerie = {
      serieClave: "sol:2",
      resultado: "CORREGIDA",
      etapa: "AVISOS",
      reintentable: false,
      encuentros: 3
    };

    const msgMigracion = describirResultadoSerie(migracion);
    const msgCorreccion = describirResultadoSerie(correccion);

    validarMensajeComprensible(msgMigracion);
    validarMensajeComprensible(msgCorreccion);
    expect(msgMigracion.detalleTecnico).toBeUndefined();
    expect(msgCorreccion.detalleTecnico).toBeUndefined();
  });

  it.each(["MIGRADA", "CORREGIDA", "YA_ZOOM", "YA_UNIFICADA"] as const)(
    "un %s reintentable por avisos pendientes no dice que no hace falta hacer nada",
    (resultado) => {
      const mensaje = describirResultadoSerie({ resultado, reintentable: true });
      expect(mensaje.reintentable).toBe(true);
      expect(`${mensaje.detalle} ${mensaje.accionSugerida}`).toMatch(/avisos/i);
      expect(`${mensaje.detalle} ${mensaje.accionSugerida}`).not.toMatch(
        /no (tenés que hacer nada|hace falta ninguna acción)/i
      );
    }
  );

  it("un resultado exitoso sin reintento conserva su mensaje de «no hace falta nada»", () => {
    expect(
      describirResultadoSerie({ resultado: "YA_UNIFICADA", reintentable: false }).accionSugerida
    ).toMatch(/no hace falta/i);
  });
});
