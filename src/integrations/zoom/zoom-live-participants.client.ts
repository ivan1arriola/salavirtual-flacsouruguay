type CalidadZoom = "good" | "fair" | "poor" | "bad";
export type EstadoParticipanteZoom = "EN_REUNION" | "EN_ESPERA" | "DESCONECTADO" | "DESCONOCIDO";
export type RolParticipanteZoom = "ANFITRION" | "PARTICIPANTE" | "DESCONOCIDO";
export type MotivoAsistenciaZoom =
  | "SIN_DATOS"
  | "SIN_REUNION"
  | "SIN_PERMISOS"
  | "PLAN_DASHBOARD_REQUERIDO"
  | "ID_REUNION_INVALIDO"
  | "LIMITE_CONSULTAS"
  | "ERROR_API"
  | "ERROR_CONEXION";

export type ParticipanteZoomEnVivo = Readonly<{
  id: string;
  nombre: string;
  email: string | null;
  ingreso: string | null;
  salida: string | null;
  estado: EstadoParticipanteZoom;
  rol: RolParticipanteZoom;
  motivoSalida: string | null;
  calidadAudio: CalidadZoom | null;
  calidadVideo: CalidadZoom | null;
  calidadPantalla: CalidadZoom | null;
  tipoConexion: string | null;
  tipoRed: string | null;
}>;

export type EstadoAsistenciaZoomEnVivo =
  | { estado: "DISPONIBLE"; participantes: readonly ParticipanteZoomEnVivo[] }
  | {
      estado: "NO_DISPONIBLE";
      motivo: MotivoAsistenciaZoom;
      httpStatus?: number;
      codigoZoom?: number | string;
      detalle?: string;
    };

type Registro = Record<string, unknown>;

function registro(valor: unknown): Registro | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor) ? (valor as Registro) : null;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function calidad(valor: unknown): CalidadZoom | null {
  return valor === "good" || valor === "fair" || valor === "poor" || valor === "bad" ? valor : null;
}

function motivoSalidaZoom(valor: unknown): string | null {
  const motivo = texto(valor)?.toLowerCase();
  if (!motivo) {
    return null;
  }
  if (motivo.includes("got disconnected") || motivo.includes("network connection error")) {
    return "Desconexión o problema de red";
  }
  if (motivo.includes("removed by host from waiting room")) {
    return "Retirado de la sala de espera";
  }
  if (motivo.includes("removed by host")) {
    return "Retirado por el anfitrión";
  }
  if (motivo.includes("leave waiting room")) {
    return "Abandonó la sala de espera";
  }
  if (motivo.includes("host did not join")) {
    return "El anfitrión no ingresó";
  }
  if (motivo.includes("host ended") || motivo.includes("host closed")) {
    return "El anfitrión finalizó la reunión";
  }
  if (motivo.includes("host started a new meeting")) {
    return "El anfitrión inició otra reunión";
  }
  if (motivo.includes("exceeded free meeting minutes")) {
    return "Se alcanzó el límite de minutos";
  }
  if (motivo.includes("left the meeting")) {
    return "Salió de la reunión";
  }
  return "Motivo informado por Zoom";
}

function rolParticipante(valor: unknown): RolParticipanteZoom {
  if (valor === "host") {
    return "ANFITRION";
  }
  if (valor === "attendee") {
    return "PARTICIPANTE";
  }
  return "DESCONOCIDO";
}

function participanteDesdeZoom(valor: unknown, indice: number): ParticipanteZoomEnVivo {
  const p = registro(valor) ?? {};
  const ingreso = texto(p.join_time);
  const salida = texto(p.leave_time);
  const estadoZoom = texto(p.status);
  let estado: EstadoParticipanteZoom = "DESCONOCIDO";
  if (salida) {
    estado = "DESCONECTADO";
  } else if (estadoZoom === "in_meeting") {
    estado = "EN_REUNION";
  } else if (estadoZoom === "in_waiting_room") {
    estado = "EN_ESPERA";
  }
  const id =
    texto(p.participant_uuid) ??
    texto(p.participant_user_id) ??
    texto(p.user_id) ??
    texto(p.id) ??
    "conexion-" + indice + "-" + (ingreso ?? "sin-hora");

  return {
    id,
    nombre: texto(p.user_name) ?? texto(p.name) ?? "Sin nombre",
    email: texto(p.email) ?? texto(p.user_email),
    ingreso,
    salida,
    estado,
    rol: rolParticipante(p.role),
    motivoSalida: motivoSalidaZoom(p.leave_reason),
    calidadAudio: calidad(p.audio_quality),
    calidadVideo: calidad(p.video_quality),
    calidadPantalla: calidad(p.screen_share_quality),
    tipoConexion: texto(p.connection_type),
    tipoRed: texto(p.network_type)
  };
}

function detalleSeguro(valor: unknown): string | undefined {
  const mensaje = texto(valor);
  if (!mensaje) {
    return undefined;
  }
  const sinCredenciales = mensaje
    .replace(/\s+/g, " ")
    .replace(/Bearer\s+\S+/gi, "[credencial oculta]")
    .replace(/https?:\/\/\S+/gi, "[enlace]");
  return sinCredenciales
    .split(" ")
    .map((parte) => (parte.includes("@") ? "[correo]" : parte))
    .join(" ")
    .slice(0, 240);
}

function errorZoom(response: Response, cuerpo: unknown): EstadoAsistenciaZoomEnVivo {
  const error = registro(cuerpo) ?? {};
  const codigo = typeof error.code === "number" || typeof error.code === "string" ? error.code : undefined;
  const codigoNumerico = codigo === undefined ? null : Number(codigo);
  const mensaje = detalleSeguro(error.message);
  const textoError = (mensaje ?? "").toLowerCase();

  let motivo: MotivoAsistenciaZoom = "ERROR_API";
  if (
    response.status === 401 ||
    response.status === 403 ||
    /invalid scope|insufficient scope|permission denied|not authorized/.test(textoError)
  ) {
    motivo = "SIN_PERMISOS";
  } else if (response.status === 404 || codigoNumerico === 3001) {
    motivo = "SIN_REUNION";
  } else if (response.status === 429 || codigoNumerico === 4001) {
    motivo = "LIMITE_CONSULTAS";
  } else if (
    (response.status === 400 && codigoNumerico === 200) ||
    textoError.includes("only available") ||
    textoError.includes("business or higher") ||
    textoError.includes("dashboard feature") ||
    textoError.includes("zmp")
  ) {
    motivo = "PLAN_DASHBOARD_REQUERIDO";
  } else if (response.status === 400 && codigoNumerico === 300) {
    motivo = "ID_REUNION_INVALIDO";
  }

  return {
    estado: "NO_DISPONIBLE",
    motivo,
    httpStatus: response.status,
    ...(codigo === undefined ? {} : { codigoZoom: codigo }),
    ...(mensaje ? { detalle: mensaje } : {})
  };
}

/**
 * Zoom Dashboard API: requiere plan Business o superior, Dashboard habilitado y scopes de lectura.
 * Solo proyecta datos operativos necesarios; descarta IP, MAC, identificadores de dispositivo y otros
 * campos sensibles que Zoom puede incluir en la respuesta.
 */
export async function obtenerParticipantesZoomEnVivoHttp(
  token: string,
  meetingId: string
): Promise<EstadoAsistenciaZoomEnVivo> {
  const participantes: ParticipanteZoomEnVivo[] = [];
  const identificador = encodeURIComponent(meetingId);
  const idCodificado =
    meetingId.startsWith("/") || meetingId.includes("//") ? encodeURIComponent(identificador) : identificador;
  let siguiente = "";
  const visitados = new Set<string>();
  let pagina = 0;

  do {
    pagina++;
    if (pagina > 20) {
      return {
        estado: "NO_DISPONIBLE",
        motivo: "ERROR_API",
        detalle: "Zoom devolvió más páginas de las esperadas; se detuvo la consulta por seguridad."
      };
    }
    const params = new URLSearchParams({ type: "live", page_size: "300" });
    if (siguiente) {
      params.set("next_page_token", siguiente);
    }

    let response: Response;
    try {
      response = await fetch(
        "https://api.zoom.us/v2/metrics/meetings/" + idCodificado + "/participants?" + params,
        {
          headers: { Authorization: "Bearer " + token },
          cache: "no-store",
          signal: AbortSignal.timeout(8000)
        }
      );
    } catch {
      return {
        estado: "NO_DISPONIBLE",
        motivo: "ERROR_CONEXION",
        detalle: "No se pudo conectar con la API de Zoom o la consulta superó el tiempo de espera."
      };
    }

    if (!response.ok) {
      const cuerpo = await response.json().catch(() => null);
      return errorZoom(response, cuerpo);
    }

    const data = registro(await response.json().catch(() => null));
    if (!data || !Array.isArray(data.participants)) {
      return {
        estado: "NO_DISPONIBLE",
        motivo: "ERROR_API",
        httpStatus: response.status,
        detalle:
          "Zoom respondió correctamente, pero la respuesta no contiene una lista válida de participantes."
      };
    }

    for (const participante of data.participants) {
      participantes.push(participanteDesdeZoom(participante, participantes.length));
    }

    siguiente = texto(data.next_page_token) ?? "";
    if (siguiente && visitados.has(siguiente)) {
      return {
        estado: "NO_DISPONIBLE",
        motivo: "ERROR_API",
        detalle: "Zoom devolvió un cursor de paginación repetido; se detuvo la consulta."
      };
    }
    if (siguiente) {
      visitados.add(siguiente);
    }
  } while (siguiente);

  return { estado: "DISPONIBLE", participantes };
}
