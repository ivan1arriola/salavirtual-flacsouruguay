import "server-only";
import {
  actualizarOcurrenciaZoomHttp,
  actualizarReunionZoomHttp,
  crearReunionZoomHttp,
  obtenerZoomAccessToken
} from "../integrations/zoom/zoom-client";
import { descifrarConfiguracion } from "../lib/config/encryption";
import { db } from "../lib/db";
import { obtenerCredencialesZoom } from "../modules/configuracion/zoom-config.service";
import {
  adoptarHorarioDeZoom,
  cancelarEncuentroEliminadoEnZoom,
  corregirHorarioEnZoom,
  ignorarReunionExterna,
  recrearReunionEnZoom,
  type DependenciasAccionesAgendaZoom
} from "../modules/operaciones/zoom-agenda-acciones.service";
import { actualizarEncuentro, eliminarEncuentro } from "../modules/reuniones/gestionar-encuentros.service";
import type { SessionActor } from "../lib/auth/session-actor.adapter";
import { leerDiagnosticoZoom } from "./zoom-diagnostico.server";

export type AccionAgendaZoom =
  | Readonly<{
      accion: "CORREGIR_EN_ZOOM" | "ADOPTAR_DE_ZOOM" | "RECREAR_EN_ZOOM" | "CANCELAR_ENCUENTRO";
      instanciaId: string;
    }>
  | Readonly<{ accion: "IGNORAR" | "DEJAR_DE_IGNORAR"; observadaId: string }>;

async function tokenZoom(): Promise<string> {
  const creds = await obtenerCredencialesZoom(db, descifrarConfiguracion);
  if (!creds.disponible) {
    throw new Error(creds.error || "Credenciales de Zoom no configuradas.");
  }
  return obtenerZoomAccessToken({
    accountId: creds.accountId,
    clientId: creds.clientId,
    clientSecret: creds.clientSecret
  });
}

const dependencias: DependenciasAccionesAgendaZoom = {
  db,
  reuniones: async () => (await leerDiagnosticoZoom()).reuniones,
  zoom: {
    async actualizarHorario(meetingId, ocurrenciaZoomId, input) {
      const token = await tokenZoom();
      return ocurrenciaZoomId
        ? actualizarOcurrenciaZoomHttp(token, meetingId, ocurrenciaZoomId, input)
        : actualizarReunionZoomHttp(token, meetingId, input);
    },
    async crearReunion(hostEmail, input) {
      return crearReunionZoomHttp(await tokenZoom(), hostEmail, input);
    }
  },
  reprogramarEncuentro: (actor, solicitudId, instanciaId, input) =>
    actualizarEncuentro({ db }, actor, solicitudId, instanciaId, input),
  eliminarEncuentro: (actor, solicitudId, instanciaId) =>
    eliminarEncuentro({ db }, actor, solicitudId, instanciaId)
};

export function ejecutarAccionAgendaZoom(actor: SessionActor, entrada: AccionAgendaZoom) {
  switch (entrada.accion) {
    case "CORREGIR_EN_ZOOM":
      return corregirHorarioEnZoom(dependencias, actor, entrada);
    case "ADOPTAR_DE_ZOOM":
      return adoptarHorarioDeZoom(dependencias, actor, entrada);
    case "RECREAR_EN_ZOOM":
      return recrearReunionEnZoom(dependencias, actor, entrada);
    case "CANCELAR_ENCUENTRO":
      return cancelarEncuentroEliminadoEnZoom(dependencias, actor, entrada);
    case "IGNORAR":
    case "DEJAR_DE_IGNORAR":
      return ignorarReunionExterna(db, actor, {
        observadaId: entrada.observadaId,
        ignorar: entrada.accion === "IGNORAR"
      });
  }
}
