import "server-only";
import {
  cohostsConfirmados,
  sincronizarCohostsGoogleExistente,
  type OperacionPendienteConferencia
} from "@/src/modules/conferencias/api";
import {
  agruparCorreosAuditoriaMeet,
  crearGoogleArtifactsProviderAdapter,
  obtenerEventosAuditoriaMeet,
  type EstadoGrabacionMeet,
  type EstadoTranscripcionMeet,
  type EventoAuditoriaMeet,
  type GoogleArtifact,
  type OrigenCorreoParticipanteMeet,
  type ParticipanteActivoMeet,
  type RolEnReunionMeet
} from "@/src/modules/archivos/api";
import {
  actualizarEspacioMeetHttp,
  crearGoogleMeetAuthClient,
  obtenerEspacioMeet
} from "@/src/integrations/google";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { ForbiddenApiError, NotFoundApiError } from "@/src/lib/http/api-error";
import {
  controlOperativoReunionSchema,
  derivarEstadoGrabacionOperativa,
  derivarEstadoReunionOperativa,
  derivarEstadoTranscripcionOperativa,
  incidenciaOperativaSchema,
  puedeConsultarReunionOperativa,
  registroAsistenciaOperativoSchema,
  type EstadoGrabacionOperativa,
  type EstadoReunionOperativa,
  type EstadoTranscripcionOperativa
} from "@/src/modules/reuniones/reunion-operativa.domain";

export type ReunionOperativaActor = Readonly<{
  id: string;
  rol: "ADMINISTRACION" | "DOCENTE" | "ASISTENTE_TECNICO";
}>;

export type HostOCohostConectadoView = Readonly<{
  nombre: string;
  email: string;
  rol: "HOST" | "COHOST" | "DOCENTE" | "ASISTENTE_TECNICO";
  conectado: boolean;
  primeraEntradaAt: string | null;
  ultimaSalidaAt: string | null;
  minutosConectado: number;
}>;

export type RegistroAsistenciaOperativoView = Readonly<{
  id?: string;
  claveParticipante: string;
  participanteMeetId: string | null;
  nombre: string;
  email: string | null;
  tipoAcceso: "CUENTA_GOOGLE" | "ANONIMO" | "TELEFONO";
  rolEnReunion: RolEnReunionMeet;
  conectado: boolean;
  primeraEntradaAt: string | null;
  ultimaSalidaAt: string | null;
  minutosConectado: number;
  porcentajeAsistencia: number;
  cumpleNormativa: boolean;
  numeroConexiones: number;
  esHostOCohost: boolean;
  enGrupoPequeno: boolean;
  salaGrupoPequeno: string | null;
  externo: boolean | null;
  origenCorreo: OrigenCorreoParticipanteMeet;
  notasOperador: string | null;
}>;

export type ReunionOperativaView = Readonly<{
  id: string;
  solicitudId: string;
  titulo: string;
  programa: string;
  docente: string;
  docenteEmail: string | null;
  modalidad: "HIBRIDA" | "VIRTUAL";
  inicioProgramadoAt: Date;
  finProgramadoAt: Date;
  estado: EstadoReunionOperativa;
  requiereGrabacion: boolean;
  grabacion: Readonly<{
    estado: EstadoGrabacionOperativa;
    grabandoEnVivo: boolean;
    url: string | null;
  }>;
  transcripcion: Readonly<{
    estado: EstadoTranscripcionOperativa;
    transcribiendoEnVivo: boolean;
    url: string | null;
  }>;
  meet: Readonly<{
    eventoProveedorId: string | null;
    codigo: string | null;
    joinUrl: string | null;
    organizador: string | null;
    estadoIntegracion: string | null;
    operacionPendiente: OperacionPendienteConferencia | null;
    errorIntegracion: string | null;
    tipoAcceso: "OPEN" | "TRUSTED" | "RESTRICTED" | string | null;
    moderacion: string | null;
    reporteAsistencia: string | null;
    cohostEmails: readonly string[];
  }>;
  conferencia: Readonly<{
    disponibilidad: "OK" | "SIN_MEET" | "SIN_CREDENCIALES" | "SIN_CONFERENCIA" | "ERROR";
    inicioRealAt: Date | null;
    finRealAt: Date | null;
    participantesActivos: readonly ParticipanteActivoMeet[];
    participantesDesconectados: readonly ParticipanteActivoMeet[];
    todosParticipantes: readonly ParticipanteActivoMeet[];
    enGruposPequenos: boolean;
    cantidadGruposPequenos: number;
    hostsYCohosts: readonly HostOCohostConectadoView[];
    asistentesRegistrados: readonly RegistroAsistenciaOperativoView[];
    error: string | null;
  }>;
  cohosts: Readonly<{
    total: number;
    confirmados: boolean;
  }>;
  asistencia: Readonly<{
    requerida: boolean;
    asistente: string | null;
    asistenteEmail: string | null;
    asignacionId: string | null;
    cierreConfirmado: boolean;
    inicioAt: Date;
    finAt: Date;
  }>;
  artefactos: Readonly<{
    grabaciones: number;
    transcripciones: number;
    notas: number;
  }>;
  incidencias: readonly Readonly<{
    id: string;
    tipo: string;
    severidad: "BAJA" | "MEDIA" | "ALTA" | "CRITICA";
    descripcion: string;
    estado: "ABIERTA" | "EN_ANALISIS" | "RESUELTA" | "CERRADA";
    createdAt: Date;
  }>[];
  actualizadoAt: Date;
}>;

export type ReunionOperativaResult =
  | Readonly<{ estado: "NO_ENCONTRADA" }>
  | Readonly<{ estado: "PROHIBIDA" }>
  | Readonly<{ estado: "OK"; reunion: ReunionOperativaView }>;

function normalizarTexto(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizarClaveParticipante(p: ParticipanteActivoMeet): string {
  if (p.user && p.user.trim()) return p.user.trim();
  if (p.participanteId && p.participanteId.trim()) return p.participanteId.trim();
  return `${p.tipo}:${normalizarTexto(p.nombre) || "anonimo"}`;
}

export async function obtenerReunionOperativa(
  actor: ReunionOperativaActor,
  instanciaId: string,
  ahora = new Date()
): Promise<ReunionOperativaResult> {
  const meeting = await db.instanciaSala.findUnique({
    where: { id: instanciaId },
    include: {
      solicitud: {
        include: {
          docentePrograma: {
            include: {
              programa: true,
              docente: { include: { usuario: true } }
            }
          }
        }
      },
      eventosProveedor: {
        where: { proveedor: { tipo: "GOOGLE_MEET" } },
        include: { proveedor: true, cuentaProveedor: true },
        take: 1
      },
      cohosts: {
        include: { cuentaGoogle: true }
      },
      cohostEmails: true,
      asignaciones: {
        where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
        include: {
          asistenteTecnico: {
            include: { usuario: true }
          }
        }
      },
      incidencias: {
        orderBy: { createdAt: "desc" },
        take: 10
      }
    }
  });

  if (!meeting) return { estado: "NO_ENCONTRADA" };

  const asignacionActor = meeting.asignaciones.find(
    ({ asistenteTecnico }) => asistenteTecnico.usuarioId === actor.id
  );
  if (!puedeConsultarReunionOperativa({
    rol: actor.rol,
    asistenteAsignado: Boolean(asignacionActor)
  })) {
    return { estado: "PROHIBIDA" };
  }

  const evento = meeting.eventosProveedor[0] ?? null;
  const cohostEmails = [
    ...new Set(
      [
        ...meeting.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email),
        ...meeting.cohostEmails.map(({ email }) => email)
      ]
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )
  ];
  const cohostConfirmado = Boolean(
    evento
      && !evento.errorIntegracion
      && !evento.operacionPendiente
      && cohostsConfirmados(
        evento.payloadUltimo,
        evento.codigoReunion,
        evento.cuentaProveedor?.emailOrganizador,
        cohostEmails
      )
  );

  let disponibilidad: ReunionOperativaView["conferencia"]["disponibilidad"] = "SIN_MEET";
  let inicioRealAt: Date | null = null;
  let finRealAt: Date | null = null;
  let participantesActivos: readonly ParticipanteActivoMeet[] = [];
  let participantesDesconectados: readonly ParticipanteActivoMeet[] = [];
  let todosParticipantes: readonly ParticipanteActivoMeet[] = [];
  let enGruposPequenos = false;
  let cantidadGruposPequenos = 0;
  let errorConferencia: string | null = null;
  let estadoProveedorGrabacion: EstadoGrabacionMeet | null = null;
  let grabandoEnVivo = false;
  let grabacionUrl: string | null = null;
  let estadoProveedorTranscripcion: EstadoTranscripcionMeet | null = null;
  let transcribiendoEnVivo = false;
  let transcripcionUrl: string | null = null;
  let grabaciones = 0;
  let transcripciones = 0;
  let notas = 0;
  let tipoAccesoMeet: string | null = evento?.codigoReunion ? "TRUSTED" : null;
  let moderacionMeet: string | null = cohostEmails.length > 0 ? "ON" : "OFF";
  let reporteAsistenciaMeet: string | null = meeting.requiereAsistenciaTecnica
    ? "GENERATE_REPORT"
    : "DO_NOT_GENERATE";
  let conferenciaIdActual: string | null = null;
  const correosAuditadosPorNombre = new Map<string, { email: string; externo: boolean | null }>();

  if (evento?.codigoReunion && evento.cuentaProveedor?.emailOrganizador) {
    const config = await db.configuracionGoogleWorkspace.findUnique({
      where: { id: "principal", activa: true },
      select: {
        serviceAccountEmail: true,
        privateKeyCifrada: true,
        serviceAccountSubject: true
      }
    });

    if (!config?.serviceAccountEmail || !config.privateKeyCifrada) {
      disponibilidad = "SIN_CREDENCIALES";
    } else {
      try {
        const privateKey = descifrarConfiguracion(config.privateKeyCifrada);
        const subject = evento.cuentaProveedor.emailOrganizador;
        const provider = crearGoogleArtifactsProviderAdapter({
          serviceAccountEmail: config.serviceAccountEmail,
          privateKey,
          subject
        });
        const meetAuth = crearGoogleMeetAuthClient({
          serviceAccountEmail: config.serviceAccountEmail,
          privateKey,
          subject
        });

        const [conferencia, espacioMeet] = await Promise.all([
          provider.buscarConferencia(
            evento.codigoReunion,
            meeting.inicioProgramadoAt,
            meeting.finProgramadoAt
          ),
          obtenerEspacioMeet(meetAuth, evento.codigoReunion).catch(() => null)
        ]);

        if (espacioMeet?.config) {
          if (espacioMeet.config.accessType && espacioMeet.config.accessType !== "ACCESS_TYPE_UNSPECIFIED") {
            tipoAccesoMeet = espacioMeet.config.accessType;
          }
          if (espacioMeet.config.moderation && espacioMeet.config.moderation !== "MODERATION_UNSPECIFIED") {
            moderacionMeet = espacioMeet.config.moderation;
          }
          if (
            espacioMeet.config.attendanceReportGenerationType
            && espacioMeet.config.attendanceReportGenerationType !== "ATTENDANCE_REPORT_GENERATION_TYPE_UNSPECIFIED"
          ) {
            reporteAsistenciaMeet = espacioMeet.config.attendanceReportGenerationType;
          }
        }

        if (!conferencia) {
          disponibilidad = "SIN_CONFERENCIA";
        } else {
          disponibilidad = "OK";
          conferenciaIdActual = conferencia.name;
          inicioRealAt = new Date(conferencia.startTime);
          finRealAt = conferencia.endTime ? new Date(conferencia.endTime) : null;

          const adminSubject = config.serviceAccountSubject || subject;
          const auditPromise = adminSubject
            ? obtenerEventosAuditoriaMeet({
                serviceAccountEmail: config.serviceAccountEmail,
                privateKey,
                adminEmail: adminSubject,
                meetingCode: evento.codigoReunion,
                startTime: new Date(meeting.inicioProgramadoAt.getTime() - 12 * 60 * 60 * 1000).toISOString(),
                endTime: new Date(Math.max(ahora.getTime(), meeting.finProgramadoAt.getTime()) + 6 * 60 * 60 * 1000).toISOString()
              })
                .then((eventos: readonly EventoAuditoriaMeet[]) => agruparCorreosAuditoriaMeet(eventos))
                .catch(() => [])
            : Promise.resolve([]);

          const [participantes, artefactos, correosAuditados] = await Promise.all([
            provider.obtenerParticipantesActivos(
              evento.codigoReunion,
              meeting.inicioProgramadoAt,
              meeting.finProgramadoAt
            ),
            provider.obtenerArtefactos(conferencia.name),
            auditPromise
          ]);

          for (const item of correosAuditados) {
            if (item.nombre && item.correo) {
              correosAuditadosPorNombre.set(normalizarTexto(item.nombre), {
                email: item.correo.trim().toLowerCase(),
                externo: item.externo
              });
            }
          }

          participantesActivos = participantes.participantesActivos;
          participantesDesconectados = participantes.participantesDesconectados ?? [];
          todosParticipantes = participantes.todosParticipantes ?? [
            ...participantes.participantesActivos,
            ...(participantes.participantesDesconectados ?? [])
          ];
          enGruposPequenos = Boolean(participantes.enGruposPequenos);
          cantidadGruposPequenos = participantes.cantidadGruposPequenos ?? 0;

          estadoProveedorGrabacion = artefactos.estadoGrabacion;
          grabandoEnVivo = Boolean(artefactos.grabandoEnVivo);
          estadoProveedorTranscripcion = artefactos.estadoTranscripcion ?? "AUSENTE";
          transcribiendoEnVivo = Boolean(artefactos.transcribiendoEnVivo);

          grabaciones = artefactos.recordings.length;
          transcripciones = artefactos.transcripts.length;
          notas = artefactos.notes.length;

          const recording = artefactos.recordings.find((r: GoogleArtifact) => Boolean(r.driveFileId)) ?? artefactos.recordings[0];
          grabacionUrl = recording?.driveFileId
            ? `https://drive.google.com/file/d/${encodeURIComponent(recording.driveFileId)}/view`
            : null;

          const transcript = artefactos.transcripts.find((t: GoogleArtifact) => Boolean(t.driveFileId)) ?? artefactos.transcripts[0];
          transcripcionUrl = transcript?.driveFileId
            ? `https://docs.google.com/document/d/${encodeURIComponent(transcript.driveFileId)}/edit`
            : null;
        }
      } catch (error) {
        disponibilidad = "ERROR";
        errorConferencia = error instanceof Error
          ? error.message
          : "No se pudo consultar el estado de Google Meet.";
      }
    }
  }

  const estado = derivarEstadoReunionOperativa({
    ahora,
    inicio: meeting.inicioProgramadoAt,
    fin: meeting.finProgramadoAt,
    conferenciaInicio: inicioRealAt,
    conferenciaFin: finRealAt
  });
  const estadoGrabacion = derivarEstadoGrabacionOperativa({
    requiereGrabacion: meeting.requiereGrabacion,
    estadoReunion: estado,
    estadoProveedor: estadoProveedorGrabacion,
    grabandoEnVivo
  });
  const estadoTranscripcion = derivarEstadoTranscripcionOperativa({
    transcribiendoEnVivo,
    estadoProveedor: estadoProveedorTranscripcion
  });

  const association = meeting.solicitud.docentePrograma;
  const teacher = association.docente.usuario;
  const teacherFullName = [teacher.nombres, teacher.apellidos].filter(Boolean).join(" ");
  const teacherEmail = teacher.emailPrincipal?.trim().toLowerCase() ?? null;

  const assignment = actor.rol === "ASISTENTE_TECNICO"
    ? asignacionActor
    : meeting.asignaciones[0];
  const assistant = assignment?.asistenteTecnico.usuario;
  const assistantFullName = assistant
    ? [assistant.nombres, assistant.apellidos].filter(Boolean).join(" ")
    : null;
  const assistantEmail = assistant?.emailPrincipal?.trim().toLowerCase() ?? null;

  const organizadorEmail = evento?.cuentaProveedor?.emailOrganizador?.trim().toLowerCase() ?? null;
  const organizadorNombre = evento?.cuentaProveedor?.nombre?.trim() || organizadorEmail || "Host Meet";

  // Directorio local para correlacionar nombres de Google Meet con correos FLACSO
  const directorioPorNombre = new Map<string, string>();
  if (teacherFullName && teacherEmail) {
    directorioPorNombre.set(normalizarTexto(teacherFullName), teacherEmail);
  }
  if (assistantFullName && assistantEmail) {
    directorioPorNombre.set(normalizarTexto(assistantFullName), assistantEmail);
  }
  if (organizadorNombre && organizadorEmail) {
    directorioPorNombre.set(normalizarTexto(organizadorNombre), organizadorEmail);
  }

  try {
    const usuariosActivos = db.usuario?.findMany
      ? await db.usuario.findMany({
          where: { activo: true },
          select: {
            nombres: true,
            apellidos: true,
            emailPrincipal: true,
            cuentasGoogle: { select: { email: true } }
          }
        })
      : [];

    for (const u of usuariosActivos) {
      const clave = normalizarTexto([u.nombres, u.apellidos].filter(Boolean).join(" "));
      const correo = u.cuentasGoogle[0]?.email ?? u.emailPrincipal;
      if (clave && correo && !directorioPorNombre.has(clave)) {
        directorioPorNombre.set(clave, correo.trim().toLowerCase());
      }
    }
  } catch {
    // Ignorar fallos de directorio en entornos de prueba con mocks parciales
  }

  const registrosPreviosMap = new Map<string, {
    id: string;
    claveParticipante: string;
    participanteMeetId: string | null;
    nombre: string;
    email: string | null;
    tipoAcceso: string;
    rolEnReunion: string;
    conectado: boolean;
    primeraEntradaAt: Date | null;
    ultimaSalidaAt: Date | null;
    minutosConectado: number;
    porcentajeAsistencia: number;
    cumpleNormativa: boolean;
    numeroConexiones: number;
    esHostOCohost: boolean;
    enGrupoPequeno: boolean;
    salaGrupoPequeno: string | null;
    externo: boolean | null;
    origenCorreo: string;
    notasOperador: string | null;
  }>();

  try {
    if (db.registroAsistenciaMeet?.findMany) {
      const previos = await db.registroAsistenciaMeet.findMany({
        where: { instanciaSalaId: meeting.id },
        orderBy: [{ conectado: "desc" }, { primeraEntradaAt: "asc" }]
      });
      for (const reg of previos) {
        registrosPreviosMap.set(reg.claveParticipante, {
          id: reg.id,
          claveParticipante: reg.claveParticipante,
          participanteMeetId: reg.participanteMeetId,
          nombre: reg.nombre,
          email: reg.email,
          tipoAcceso: reg.tipoAcceso,
          rolEnReunion: reg.rolEnReunion,
          conectado: reg.conectado,
          primeraEntradaAt: reg.primeraEntradaAt,
          ultimaSalidaAt: reg.ultimaSalidaAt,
          minutosConectado: reg.minutosConectado,
          porcentajeAsistencia: reg.porcentajeAsistencia ? Number(reg.porcentajeAsistencia) : 0,
          cumpleNormativa: Boolean(reg.cumpleNormativa),
          numeroConexiones: reg.numeroConexiones,
          esHostOCohost: reg.esHostOCohost,
          enGrupoPequeno: reg.enGrupoPequeno,
          salaGrupoPequeno: reg.salaGrupoPequeno,
          externo: reg.externo,
          origenCorreo: reg.origenCorreo ?? "SIN_CORREO",
          notasOperador: reg.notasOperador
        });
      }
    }
  } catch {
    // Tabla aún no migrada o entorno de test con mock parcial
  }

  const cohostSet = new Set(cohostEmails);
  const duracionProgramadaMin = Math.max(
    1,
    Math.round((meeting.finProgramadoAt.getTime() - meeting.inicioProgramadoAt.getTime()) / 60_000)
  );

  function resolverRolParticipante(
    nombreNorm: string,
    email: string | null,
    rolPrevioManual?: string | null
  ): RolEnReunionMeet {
    if (
      rolPrevioManual === "HOST"
      || rolPrevioManual === "COHOST"
      || rolPrevioManual === "DOCENTE"
      || rolPrevioManual === "ASISTENTE_TECNICO"
    ) {
      return rolPrevioManual;
    }
    const mailNorm = email?.trim().toLowerCase() ?? null;
    if (mailNorm && organizadorEmail && mailNorm === organizadorEmail) return "HOST";
    if (mailNorm && cohostSet.has(mailNorm)) return "COHOST";
    if ((mailNorm && teacherEmail && mailNorm === teacherEmail) || (nombreNorm && nombreNorm === normalizarTexto(teacherFullName))) {
      return "DOCENTE";
    }
    if (
      (mailNorm && assistantEmail && mailNorm === assistantEmail)
      || (assistantFullName && nombreNorm === normalizarTexto(assistantFullName))
    ) {
      return "ASISTENTE_TECNICO";
    }
    return "PARTICIPANTE";
  }

  function enriquecerParticipante(p: ParticipanteActivoMeet, conectadoDefault: boolean): ParticipanteActivoMeet & {
    claveParticipante: string;
    origenCorreo: OrigenCorreoParticipanteMeet;
    externo: boolean | null;
  } {
    const clave = normalizarClaveParticipante(p);
    const previo = registrosPreviosMap.get(clave);
    const nombreNorm = normalizarTexto(p.nombre);
    const auditado = correosAuditadosPorNombre.get(nombreNorm);
    const correoDirectorio = directorioPorNombre.get(nombreNorm) ?? null;

    let email: string | null = null;
    let origenCorreo: OrigenCorreoParticipanteMeet = "SIN_CORREO";
    let externo: boolean | null = previo?.externo ?? null;

    if (previo?.origenCorreo === "MANUAL" && previo.email) {
      email = previo.email;
      origenCorreo = "MANUAL";
    } else if (p.email) {
      email = p.email.trim().toLowerCase();
      origenCorreo = "GOOGLE_MEET";
    } else if (auditado?.email) {
      email = auditado.email;
      origenCorreo = "REPORTS_API";
      externo = auditado.externo;
    } else if (correoDirectorio) {
      email = correoDirectorio;
      origenCorreo = "DIRECTORIO_FLACSO";
      externo = !correoDirectorio.endsWith("@flacso.edu.uy");
    } else if (previo?.email) {
      email = previo.email;
      origenCorreo = (previo.origenCorreo as OrigenCorreoParticipanteMeet) || "DIRECTORIO_FLACSO";
    }

    const rolEnReunion = resolverRolParticipante(
      nombreNorm,
      email,
      previo?.origenCorreo === "MANUAL" ? previo.rolEnReunion : null
    );
    const esHostOCohost =
      rolEnReunion === "HOST"
      || rolEnReunion === "COHOST"
      || rolEnReunion === "DOCENTE"
      || rolEnReunion === "ASISTENTE_TECNICO";

    const conectado = p.conectado ?? conectadoDefault;
    const minutosConectado = p.minutosConectado ?? previo?.minutosConectado ?? 0;
    const enGrupoPequeno = p.enGrupoPequeno ?? previo?.enGrupoPequeno ?? false;
    const salaGrupoPequeno = p.salaGrupoPequeno ?? previo?.salaGrupoPequeno ?? undefined;
    const notasOperador = previo?.notasOperador ?? undefined;

    return {
      ...p,
      email: email ?? undefined,
      conectado,
      minutosConectado,
      rolEnReunion,
      esHostOCohost,
      enGrupoPequeno,
      salaGrupoPequeno,
      claveParticipante: clave,
      origenCorreo,
      notasOperador,
      externo
    };
  }

  const activosEnriquecidos = participantesActivos.map((p) => enriquecerParticipante(p, true));
  const desconectadosEnriquecidos = participantesDesconectados.map((p) => enriquecerParticipante(p, false));
  const todosEnriquecidos = [
    ...activosEnriquecidos,
    ...desconectadosEnriquecidos
  ];

  // Persistir automáticamente los participantes detectados en RegistroAsistenciaMeet
  const asistentesRegistrados: RegistroAsistenciaOperativoView[] = [];
  const clavesVistas = new Set<string>();

  for (const item of todosEnriquecidos) {
    clavesVistas.add(item.claveParticipante);
    const porcentajeAsistencia = Math.min(
      100,
      Math.round(((item.minutosConectado ?? 0) / duracionProgramadaMin) * 100)
    );
    const cumpleNormativa = porcentajeAsistencia >= 80;

    const viewRecord: RegistroAsistenciaOperativoView = {
      id: registrosPreviosMap.get(item.claveParticipante)?.id,
      claveParticipante: item.claveParticipante,
      participanteMeetId: item.participanteId ?? null,
      nombre: item.nombre,
      email: item.email ?? null,
      tipoAcceso: item.tipo,
      rolEnReunion: item.rolEnReunion ?? "PARTICIPANTE",
      conectado: Boolean(item.conectado),
      primeraEntradaAt: item.primeraEntradaAt ?? null,
      ultimaSalidaAt: item.ultimaSalidaAt ?? null,
      minutosConectado: item.minutosConectado ?? 0,
      porcentajeAsistencia,
      cumpleNormativa,
      numeroConexiones: item.numeroConexiones ?? 1,
      esHostOCohost: Boolean(item.esHostOCohost),
      enGrupoPequeno: Boolean(item.enGrupoPequeno),
      salaGrupoPequeno: item.salaGrupoPequeno ?? null,
      externo: item.externo,
      origenCorreo: item.origenCorreo,
      notasOperador: item.notasOperador ?? null
    };
    asistentesRegistrados.push(viewRecord);

    try {
      if (db.registroAsistenciaMeet?.upsert) {
        await db.registroAsistenciaMeet.upsert({
          where: {
            instanciaSalaId_claveParticipante: {
              instanciaSalaId: meeting.id,
              claveParticipante: item.claveParticipante
            }
          },
          create: {
            instanciaSalaId: meeting.id,
            claveParticipante: item.claveParticipante,
            participanteMeetId: item.participanteId ?? null,
            nombre: item.nombre,
            email: item.email ?? null,
            tipoAcceso: item.tipo,
            rolEnReunion: viewRecord.rolEnReunion,
            conectado: viewRecord.conectado,
            primeraEntradaAt: viewRecord.primeraEntradaAt ? new Date(viewRecord.primeraEntradaAt) : null,
            ultimaSalidaAt: viewRecord.ultimaSalidaAt ? new Date(viewRecord.ultimaSalidaAt) : null,
            minutosConectado: viewRecord.minutosConectado,
            porcentajeAsistencia: viewRecord.porcentajeAsistencia,
            cumpleNormativa: viewRecord.cumpleNormativa,
            numeroConexiones: viewRecord.numeroConexiones,
            esHostOCohost: viewRecord.esHostOCohost,
            enGrupoPequeno: viewRecord.enGrupoPequeno,
            salaGrupoPequeno: viewRecord.salaGrupoPequeno,
            externo: viewRecord.externo,
            conferenciaId: conferenciaIdActual,
            origenCorreo: viewRecord.origenCorreo,
            notasOperador: viewRecord.notasOperador
          },
          update: {
            participanteMeetId: item.participanteId ?? undefined,
            nombre: item.nombre,
            email: viewRecord.email ?? undefined,
            tipoAcceso: item.tipo,
            rolEnReunion: viewRecord.rolEnReunion,
            conectado: viewRecord.conectado,
            primeraEntradaAt: viewRecord.primeraEntradaAt ? new Date(viewRecord.primeraEntradaAt) : undefined,
            ultimaSalidaAt: viewRecord.ultimaSalidaAt ? new Date(viewRecord.ultimaSalidaAt) : null,
            minutosConectado: viewRecord.minutosConectado,
            porcentajeAsistencia: viewRecord.porcentajeAsistencia,
            cumpleNormativa: viewRecord.cumpleNormativa,
            numeroConexiones: viewRecord.numeroConexiones,
            esHostOCohost: viewRecord.esHostOCohost,
            enGrupoPequeno: viewRecord.enGrupoPequeno,
            salaGrupoPequeno: viewRecord.salaGrupoPequeno,
            externo: viewRecord.externo ?? undefined,
            conferenciaId: conferenciaIdActual ?? undefined,
            origenCorreo: viewRecord.origenCorreo
          }
        });
      }
    } catch {
      // No interrumpir la vista operativa si la base de datos está en modo solo lectura o test
    }
  }

  // Incluir registros guardados en DB que aún no estén en el scan actual de Meet
  for (const [clave, reg] of registrosPreviosMap.entries()) {
    if (clavesVistas.has(clave)) continue;
    asistentesRegistrados.push({
      id: reg.id,
      claveParticipante: reg.claveParticipante,
      participanteMeetId: reg.participanteMeetId,
      nombre: reg.nombre,
      email: reg.email,
      tipoAcceso: (reg.tipoAcceso as "CUENTA_GOOGLE" | "ANONIMO" | "TELEFONO") || "CUENTA_GOOGLE",
      rolEnReunion: (reg.rolEnReunion as RolEnReunionMeet) || "PARTICIPANTE",
      conectado: conferenciaIdActual ? false : reg.conectado,
      primeraEntradaAt: reg.primeraEntradaAt ? reg.primeraEntradaAt.toISOString() : null,
      ultimaSalidaAt: reg.ultimaSalidaAt ? reg.ultimaSalidaAt.toISOString() : null,
      minutosConectado: reg.minutosConectado,
      porcentajeAsistencia: reg.porcentajeAsistencia,
      cumpleNormativa: reg.cumpleNormativa,
      numeroConexiones: reg.numeroConexiones,
      esHostOCohost: reg.esHostOCohost,
      enGrupoPequeno: reg.enGrupoPequeno,
      salaGrupoPequeno: reg.salaGrupoPequeno,
      externo: reg.externo,
      origenCorreo: (reg.origenCorreo as OrigenCorreoParticipanteMeet) || "SIN_CORREO",
      notasOperador: reg.notasOperador
    });
  }

  // Construir estado de conexión de Host, Cohosts, Docente y Asistente Técnico
  const hostsYCohostsMap = new Map<string, HostOCohostConectadoView>();

  function registrarCandidatoHost(
    email: string | null,
    nombre: string,
    rol: "HOST" | "COHOST" | "DOCENTE" | "ASISTENTE_TECNICO"
  ) {
    const clave = email ? email.trim().toLowerCase() : `nombre:${normalizarTexto(nombre)}`;
    if (!clave || hostsYCohostsMap.has(clave)) return;

    const match = asistentesRegistrados.find((a) => {
      if (email && a.email && a.email.trim().toLowerCase() === email.trim().toLowerCase()) {
        return true;
      }
      return Boolean(nombre && normalizarTexto(a.nombre) === normalizarTexto(nombre));
    });

    hostsYCohostsMap.set(clave, {
      nombre: match?.nombre || nombre || email || "Sin nombre",
      email: email ?? match?.email ?? "Sin correo",
      rol,
      conectado: Boolean(match?.conectado),
      primeraEntradaAt: match?.primeraEntradaAt ?? null,
      ultimaSalidaAt: match?.ultimaSalidaAt ?? null,
      minutosConectado: match?.minutosConectado ?? 0
    });
  }

  if (organizadorEmail) {
    registrarCandidatoHost(organizadorEmail, organizadorNombre, "HOST");
  }
  if (teacherFullName || teacherEmail) {
    registrarCandidatoHost(teacherEmail, teacherFullName, "DOCENTE");
  }
  if (assistantFullName || assistantEmail) {
    registrarCandidatoHost(assistantEmail, assistantFullName ?? "Asistente técnico", "ASISTENTE_TECNICO");
  }
  for (const cohost of meeting.cohosts) {
    const mail = cohost.cuentaGoogle.email.trim().toLowerCase();
    registrarCandidatoHost(mail, mail, "COHOST");
  }
  for (const cohostMail of meeting.cohostEmails) {
    registrarCandidatoHost(cohostMail.email.trim().toLowerCase(), cohostMail.email, "COHOST");
  }

  return {
    estado: "OK",
    reunion: {
      id: meeting.id,
      solicitudId: meeting.solicitud.id,
      titulo: meeting.solicitud.titulo,
      programa: association.programa.nombre,
      docente: teacherFullName,
      docenteEmail: teacherEmail,
      modalidad: (meeting.modalidadOverride ?? meeting.solicitud.modalidad),
      inicioProgramadoAt: meeting.inicioProgramadoAt,
      finProgramadoAt: meeting.finProgramadoAt,
      estado,
      requiereGrabacion: meeting.requiereGrabacion,
      grabacion: {
        estado: estadoGrabacion,
        grabandoEnVivo,
        url: grabacionUrl
      },
      transcripcion: {
        estado: estadoTranscripcion,
        transcribiendoEnVivo,
        url: transcripcionUrl
      },
      meet: {
        eventoProveedorId: evento?.id ?? null,
        codigo: evento?.codigoReunion ?? null,
        joinUrl: evento?.joinUrl ?? null,
        organizador: evento?.cuentaProveedor?.emailOrganizador ?? null,
        estadoIntegracion: evento?.estadoIntegracion ?? null,
        operacionPendiente: evento?.operacionPendiente ?? null,
        errorIntegracion: evento?.errorIntegracion ?? null,
        tipoAcceso: tipoAccesoMeet,
        moderacion: moderacionMeet,
        reporteAsistencia: reporteAsistenciaMeet,
        cohostEmails
      },
      conferencia: {
        disponibilidad,
        inicioRealAt,
        finRealAt,
        participantesActivos: activosEnriquecidos,
        participantesDesconectados: desconectadosEnriquecidos,
        todosParticipantes: todosEnriquecidos,
        enGruposPequenos,
        cantidadGruposPequenos,
        hostsYCohosts: [...hostsYCohostsMap.values()],
        asistentesRegistrados,
        error: errorConferencia
      },
      cohosts: {
        total: cohostSet.size,
        confirmados: cohostConfirmado
      },
      asistencia: {
        requerida: meeting.requiereAsistenciaTecnica,
        asistente: assistantFullName,
        asistenteEmail: assistantEmail,
        asignacionId: assignment?.id ?? null,
        cierreConfirmado: assignment?.minutosConfirmados != null,
        inicioAt: meeting.inicioAsistenciaTecnicaAt ?? meeting.inicioProgramadoAt,
        finAt: meeting.finAsistenciaTecnicaAt ?? meeting.finProgramadoAt
      },
      artefactos: {
        grabaciones,
        transcripciones,
        notas
      },
      incidencias: meeting.incidencias,
      actualizadoAt: ahora
    }
  };
}

export async function registrarIncidenciaOperativa(
  actor: ReunionOperativaActor,
  instanciaId: string,
  input: unknown
) {
  const parsed = incidenciaOperativaSchema.parse(input);

  return db.$transaction(async (tx) => {
    const meeting = await tx.instanciaSala.findUnique({
      where: { id: instanciaId },
      select: {
        id: true,
        asignaciones: {
          where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
          select: {
            asistenteTecnico: { select: { usuarioId: true } }
          }
        }
      }
    });

    if (!meeting) throw new NotFoundApiError("La reunión no existe.");

    const asistenteAsignado = meeting.asignaciones.some(
      ({ asistenteTecnico }) => asistenteTecnico.usuarioId === actor.id
    );
    if (!puedeConsultarReunionOperativa({
      rol: actor.rol,
      asistenteAsignado
    })) {
      throw new ForbiddenApiError("No tenés permisos para registrar incidencias en esta reunión.");
    }

    const incidencia = await tx.incidencia.create({
      data: {
        instanciaSalaId: instanciaId,
        tipo: parsed.tipo,
        severidad: parsed.severidad,
        descripcion: parsed.descripcion
      },
      select: {
        id: true,
        tipo: true,
        severidad: true,
        descripcion: true,
        estado: true,
        createdAt: true
      }
    });

    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: "INCIDENCIA_OPERATIVA_REGISTRADA",
        entidadTipo: "Incidencia",
        entidadId: incidencia.id,
        valorNuevo: {
          instanciaSalaId: instanciaId,
          tipo: incidencia.tipo,
          severidad: incidencia.severidad,
          descripcion: incidencia.descripcion
        }
      }
    });

    return incidencia;
  });
}

export async function actualizarControlOperativoReunion(
  actor: ReunionOperativaActor,
  instanciaId: string,
  input: unknown
) {
  const parsed = controlOperativoReunionSchema.parse(input);

  const meeting = await db.instanciaSala.findUnique({
    where: { id: instanciaId },
    include: {
      eventosProveedor: {
        where: { proveedor: { tipo: "GOOGLE_MEET" } },
        include: { cuentaProveedor: true },
        take: 1
      },
      cohosts: {
        include: { cuentaGoogle: true }
      },
      cohostEmails: true,
      asignaciones: {
        where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
        select: {
          asistenteTecnico: { select: { usuarioId: true } }
        }
      }
    }
  });

  if (!meeting) throw new NotFoundApiError("La reunión no existe.");

  const asistenteAsignado = meeting.asignaciones.some(
    ({ asistenteTecnico }) => asistenteTecnico.usuarioId === actor.id
  );
  if (!puedeConsultarReunionOperativa({
    rol: actor.rol,
    asistenteAsignado
  })) {
    throw new ForbiddenApiError("No tenés permisos para modificar el control operativo de esta reunión.");
  }

  const updateData: {
    requiereGrabacion?: boolean;
    modalidadOverride?: "HIBRIDA" | "VIRTUAL";
    inicioAsistenciaTecnicaAt?: Date;
    finAsistenciaTecnicaAt?: Date;
  } = {};

  if (parsed.requiereGrabacion !== undefined) {
    updateData.requiereGrabacion = parsed.requiereGrabacion;
  }
  if (parsed.modalidad !== undefined) {
    updateData.modalidadOverride = parsed.modalidad;
  }
  if (parsed.inicioAsistenciaTecnicaAt) {
    const fecha = new Date(parsed.inicioAsistenciaTecnicaAt);
    if (!Number.isNaN(fecha.getTime())) {
      updateData.inicioAsistenciaTecnicaAt = fecha;
    }
  }
  if (parsed.finAsistenciaTecnicaAt) {
    const fecha = new Date(parsed.finAsistenciaTecnicaAt);
    if (!Number.isNaN(fecha.getTime())) {
      updateData.finAsistenciaTecnicaAt = fecha;
    }
  }

  if (Object.keys(updateData).length > 0) {
    await db.instanciaSala.update({
      where: { id: instanciaId },
      data: updateData
    });
  }

  const cohostsAnteriores = [
    ...new Set(
      [
        ...meeting.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email),
        ...meeting.cohostEmails.map(({ email }) => email)
      ]
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    )
  ];
  let cohostsDeseados = [...cohostsAnteriores];

  if (parsed.agregarCohostEmail) {
    const nuevoEmail = parsed.agregarCohostEmail.trim().toLowerCase();
    await db.cohostEmailReunion.upsert({
      where: {
        instanciaSalaId_email: {
          instanciaSalaId: instanciaId,
          email: nuevoEmail
        }
      },
      create: {
        instanciaSalaId: instanciaId,
        email: nuevoEmail
      },
      update: {}
    });
    if (!cohostsDeseados.includes(nuevoEmail)) {
      cohostsDeseados = [...cohostsDeseados, nuevoEmail];
    }
  }

  if (parsed.quitarCohostEmail) {
    const quitarEmail = parsed.quitarCohostEmail.trim().toLowerCase();
    await db.cohostEmailReunion.deleteMany({
      where: {
        instanciaSalaId: instanciaId,
        email: quitarEmail
      }
    });
    const cohostCuenta = meeting.cohosts.find(
      ({ cuentaGoogle }) => cuentaGoogle.email.trim().toLowerCase() === quitarEmail
    );
    if (cohostCuenta) {
      await db.cohostReunion.deleteMany({
        where: {
          instanciaSalaId: instanciaId,
          cuentaGoogleId: cohostCuenta.cuentaGoogleId
        }
      });
    }
    cohostsDeseados = cohostsDeseados.filter((e) => e !== quitarEmail);
  }

  // Sincronizar en tiempo real con Google Meet si el espacio existe
  const evento = meeting.eventosProveedor[0] ?? null;
  let sincronizadoConGoogle = false;
  let advertenciaGoogle: string | null = null;

  if (
    evento?.codigoReunion
    && evento.cuentaProveedor?.emailOrganizador
    && (parsed.tipoAccesoMeet || parsed.agregarCohostEmail || parsed.quitarCohostEmail)
  ) {
    const config = await db.configuracionGoogleWorkspace.findUnique({
      where: { id: "principal", activa: true },
      select: {
        serviceAccountEmail: true,
        privateKeyCifrada: true
      }
    });

    if (config?.serviceAccountEmail && config.privateKeyCifrada) {
      try {
        const privateKey = descifrarConfiguracion(config.privateKeyCifrada);
        const subject = evento.cuentaProveedor.emailOrganizador;

        if (parsed.tipoAccesoMeet) {
          const meetAuth = crearGoogleMeetAuthClient({
            serviceAccountEmail: config.serviceAccountEmail,
            privateKey,
            subject
          });
          const espacio = await obtenerEspacioMeet(meetAuth, evento.codigoReunion);
          if (espacio.name) {
            await actualizarEspacioMeetHttp(
              meetAuth,
              espacio.name,
              { accessType: parsed.tipoAccesoMeet },
              ["config.access_type"]
            );
          }
        }

        if ((parsed.agregarCohostEmail || parsed.quitarCohostEmail) && evento.externalEventId) {
          const payloadActualizado = await sincronizarCohostsGoogleExistente(
            {
              serviceAccountEmail: config.serviceAccountEmail,
              privateKey,
              subject
            },
            {
              calendarId: evento.cuentaProveedor.externalAccountId || subject,
              externalEventId: evento.externalEventId,
              codigoReunion: evento.codigoReunion,
              cohostsAnteriores,
              cohostsDeseados
            }
          );
          await db.eventoProveedor.update({
            where: { id: evento.id },
            data: {
              payloadUltimo: payloadActualizado as object,
              errorIntegracion: null,
              operacionPendiente: null
            }
          });
        }

        sincronizadoConGoogle = true;
      } catch (error) {
        advertenciaGoogle = error instanceof Error
          ? error.message
          : "Se guardó en Sala Virtual, pero Google Meet rechazó la actualización remota.";
      }
    }
  }

  await db.auditoria.create({
    data: {
      actorUsuarioId: actor.id,
      accion: "CONTROL_OPERATIVO_REUNION_ACTUALIZADO",
      entidadTipo: "InstanciaSala",
      entidadId: instanciaId,
      valorNuevo: {
        ...parsed,
        sincronizadoConGoogle,
        advertenciaGoogle
      }
    }
  });

  return {
    ok: true,
    sincronizadoConGoogle,
    advertenciaGoogle
  };
}

export async function guardarRegistroAsistenciaOperativo(
  actor: ReunionOperativaActor,
  instanciaId: string,
  input: unknown
) {
  const parsed = registroAsistenciaOperativoSchema.parse(input);

  const meeting = await db.instanciaSala.findUnique({
    where: { id: instanciaId },
    select: {
      id: true,
      inicioProgramadoAt: true,
      finProgramadoAt: true,
      asignaciones: {
        where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
        select: {
          asistenteTecnico: { select: { usuarioId: true } }
        }
      }
    }
  });

  if (!meeting) throw new NotFoundApiError("La reunión no existe.");

  const asistenteAsignado = meeting.asignaciones.some(
    ({ asistenteTecnico }) => asistenteTecnico.usuarioId === actor.id
  );
  if (!puedeConsultarReunionOperativa({
    rol: actor.rol,
    asistenteAsignado
  })) {
    throw new ForbiddenApiError("No tenés permisos para editar asistentes en esta reunión.");
  }

  const emailLimpio = parsed.email && parsed.email.trim()
    ? parsed.email.trim().toLowerCase()
    : null;
  const rol = parsed.rolEnReunion ?? "PARTICIPANTE";
  const esHostOCohost =
    rol === "HOST"
    || rol === "COHOST"
    || rol === "DOCENTE"
    || rol === "ASISTENTE_TECNICO";
  const origenCorreo: OrigenCorreoParticipanteMeet = emailLimpio ? "MANUAL" : "SIN_CORREO";

  const registro = await db.registroAsistenciaMeet.upsert({
    where: {
      instanciaSalaId_claveParticipante: {
        instanciaSalaId: instanciaId,
        claveParticipante: parsed.claveParticipante
      }
    },
    create: {
      instanciaSalaId: instanciaId,
      claveParticipante: parsed.claveParticipante,
      nombre: parsed.nombre,
      email: emailLimpio,
      tipoAcceso: parsed.tipoAcceso ?? "CUENTA_GOOGLE",
      rolEnReunion: rol,
      conectado: parsed.conectado ?? true,
      primeraEntradaAt: new Date(),
      esHostOCohost,
      enGrupoPequeno: parsed.enGrupoPequeno ?? false,
      salaGrupoPequeno: parsed.salaGrupoPequeno ?? null,
      externo: emailLimpio ? !emailLimpio.endsWith("@flacso.edu.uy") : null,
      origenCorreo,
      notasOperador: parsed.notasOperador ?? null
    },
    update: {
      nombre: parsed.nombre,
      email: emailLimpio,
      ...(parsed.tipoAcceso ? { tipoAcceso: parsed.tipoAcceso } : {}),
      ...(parsed.rolEnReunion ? { rolEnReunion: rol, esHostOCohost } : {}),
      ...(parsed.conectado !== undefined ? { conectado: parsed.conectado } : {}),
      ...(parsed.enGrupoPequeno !== undefined ? { enGrupoPequeno: parsed.enGrupoPequeno } : {}),
      ...(parsed.salaGrupoPequeno !== undefined ? { salaGrupoPequeno: parsed.salaGrupoPequeno } : {}),
      ...(parsed.notasOperador !== undefined ? { notasOperador: parsed.notasOperador } : {}),
      externo: emailLimpio ? !emailLimpio.endsWith("@flacso.edu.uy") : null,
      origenCorreo
    }
  });

  await db.auditoria.create({
    data: {
      actorUsuarioId: actor.id,
      accion: "REGISTRO_ASISTENCIA_OPERATIVO_GUARDADO",
      entidadTipo: "RegistroAsistenciaMeet",
      entidadId: registro.id,
      valorNuevo: {
        instanciaSalaId: instanciaId,
        claveParticipante: registro.claveParticipante,
        nombre: registro.nombre,
        email: registro.email,
        rolEnReunion: registro.rolEnReunion,
        enGrupoPequeno: registro.enGrupoPequeno,
        salaGrupoPequeno: registro.salaGrupoPequeno
      }
    }
  });

  return registro;
}
