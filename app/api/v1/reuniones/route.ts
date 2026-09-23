import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";
import {
  eliminarEventoCalendarioAsistente,
  publicarEventoCalendarioAsistente,
} from "@/src/modules/asistencia/calendario-asistente-google.adapter";
import { intentarSincronizacionCalendarioAsistente } from "@/src/modules/asistencia/calendario-asistente-safe.service";
import {
  hayErroresSincronizacionCalendarioAsistente,
  sincronizarCalendariosAsistenteSolicitud,
} from "@/src/modules/asistencia/calendario-asistente.service";
import { obtenerServicioConferencias } from "@/src/bootstrap/conferencias.server";
import { notificarUsuario, notificarUsuarios, reunionEmailText } from "@/src/modules/notificaciones/notificaciones.service";
import { crearReuniones } from "@/src/modules/reuniones/crear-reuniones.service";
import { destinatariosDocentesPrograma } from "@/src/modules/reuniones/permisos-programa.service";
import { claveIdempotenciaCreacionSchema } from "@/src/modules/reuniones/reuniones.domain";
import { formatShortDate, formatTime } from "@/src/lib/ui/format";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = await request.json().catch(() => null);
  const idempotencyHeader = request.headers.get("Idempotency-Key");

  try {
    const claveIdempotenciaCreacion = idempotencyHeader
      ? claveIdempotenciaCreacionSchema.parse(idempotencyHeader)
      : undefined;
    const actor = await resolveSessionActor(db, {
      id: session.user.id,
      email: session.user.email
    });
    if (!actor?.activo) {
      return NextResponse.json(
        { error: "La sesión está desactualizada. Volvé a iniciar sesión." },
        { status: 401 }
      );
    }
    const result = await crearReuniones(
      db,
      { id: actor.id, rol: actor.rol },
      input,
      claveIdempotenciaCreacion,
    );
    const provisionamiento = await obtenerServicioConferencias()
      .sincronizarEventosPendientes(result.eventoProveedorIds);
    const intentoCalendario = await intentarSincronizacionCalendarioAsistente(() =>
      sincronizarCalendariosAsistenteSolicitud({
        db,
        descifrar: descifrarConfiguracion,
        publicarEvento: publicarEventoCalendarioAsistente,
        eliminarEvento: eliminarEventoCalendarioAsistente,
      }, result.solicitudId)
    );
    const calendarioAsistente = intentoCalendario.resultados;
    const calendarPending = intentoCalendario.error !== null ||
      hayErroresSincronizacionCalendarioAsistente(calendarioAsistente);

    if (result.reutilizada) {
      const { eventoProveedorIds: _, ...reunion } = result;
      return NextResponse.json(
        { ...reunion, provisionamiento, calendarioAsistente },
        { status: provisionamiento.some(({ estado }) => estado !== "SINCRONIZADA") || calendarPending ? 202 : 200 },
      );
    }

    const advertencias: string[] = [];
    if (calendarPending) {
      advertencias.push("La reunión se creó, pero el calendario del asistente técnico todavía tiene sincronizaciones pendientes.");
    }
    try {
      await notificarReunionCreada(result.solicitudId);
    } catch (error) {
      console.warn("La reunion se creo, pero no se pudieron generar todas las notificaciones", error);
      advertencias.push("La reunion se creo correctamente, pero algunas notificaciones no pudieron enviarse.");
    }
    const { eventoProveedorIds: _, ...reunion } = result;
    return NextResponse.json(
      { ...reunion, provisionamiento, calendarioAsistente, ...(advertencias.length > 0 ? { advertencias } : {}) },
      { status: provisionamiento.some(({ estado }) => estado !== "SINCRONIZADA") || calendarPending ? 202 : 201 }
    );
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

async function notificarReunionCreada(solicitudId: string) {
  const solicitud = await db.solicitudSala.findUnique({
    where: { id: solicitudId },
    include: {
      creadaPor: { select: { id: true, emailPrincipal: true } },
      docentePrograma: {
        include: {
          programa: true,
          docente: { include: { usuario: { select: { id: true, nombres: true, apellidos: true, emailPrincipal: true } } } }
        }
      },
      instancias: {
        orderBy: { inicioProgramadoAt: "asc" },
        include: {
          asignaciones: {
            where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
            include: { asistenteTecnico: { include: { usuario: true } } }
          },
          eventosProveedor: {
            include: { proveedor: true, cuentaProveedor: true }
          }
        }
      }
    }
  });
  if (!solicitud) return;

  const docenteUsuario = solicitud.docentePrograma.docente.usuario;
  const docenteNombre = [docenteUsuario.nombres, docenteUsuario.apellidos].filter(Boolean).join(" ");
  const docentesPrograma = await destinatariosDocentesPrograma(db, solicitud.docentePrograma.programaId);
  const responsablesPrograma = [
    { usuarioId: solicitud.creadaPor.id, email: solicitud.creadaPor.emailPrincipal },
    ...docentesPrograma
  ];
  const instancias = solicitud.instancias.map((instancia) => {
    const meet = instancia.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
    const inicioFecha = formatShortDate(instancia.inicioProgramadoAt);
    const finFecha = formatShortDate(instancia.finProgramadoAt);
    const inicio = `${capitalizar(inicioFecha)}, ${formatTime(instancia.inicioProgramadoAt)}`;
    const fin = inicioFecha === finFecha
      ? formatTime(instancia.finProgramadoAt)
      : `${capitalizar(finFecha)}, ${formatTime(instancia.finProgramadoAt)}`;
    return {
      inicio,
      fin,
      sala: meet?.cuentaProveedor?.emailOrganizador ?? meet?.cuentaProveedor?.nombre,
      meet: meet?.codigoReunion,
      joinUrl: meet?.joinUrl
    };
  });
  const firstAssignedAssistant = solicitud.instancias
    .flatMap((i) => i.asignaciones)
    .find((a) => a.asistenteTecnico)?.asistenteTecnico;
  const initialAssistantName = firstAssignedAssistant
    ? [firstAssignedAssistant.usuario.nombres, firstAssignedAssistant.usuario.apellidos].filter(Boolean).join(" ")
    : null;

  const detailsText = reunionEmailText({
    titulo: solicitud.titulo,
    programa: solicitud.docentePrograma.programa.nombre,
    docente: docenteNombre,
    modalidad: solicitud.modalidad,
    requiereAsistenciaTecnica: solicitud.requiereAsistenciaTecnica,
    requiereGrabacion: solicitud.requiereGrabacion,
    asistenteTecnico: initialAssistantName,
    instancias
  });
  await notificarUsuarios(
    db,
    responsablesPrograma,
    {
      tipo: "REUNION_CREADA",
      titulo: "Reunión creada",
      cuerpo: `${solicitud.titulo} quedó registrada con ${solicitud.instancias.length} ${solicitud.instancias.length === 1 ? "encuentro" : "encuentros"}.`,
      href: `/reuniones/${solicitud.id}`,
      metadata: { solicitudId: solicitud.id },
      emailSubject: `Reunión creada: ${solicitud.titulo}`,
      emailText: detailsText,
      emailActionLabel: "Ver reunión"
    }
  );

  const assignedAssistants = solicitud.instancias.flatMap((instancia) =>
    instancia.asignaciones.map((assignment) => ({ instancia, assistant: assignment.asistenteTecnico }))
  );
  for (const { instancia, assistant } of assignedAssistants) {
    const assistantName = [assistant.usuario.nombres, assistant.usuario.apellidos].filter(Boolean).join(" ");
    await notificarUsuario(
      db,
      { usuarioId: assistant.usuario.id, email: assistant.usuario.emailPrincipal },
      {
        tipo: "ASISTENCIA_ASIGNACION",
        titulo: "Te asignaron una reunión",
        cuerpo: `${solicitud.titulo} quedó asignada a tu agenda de asistencia técnica.`,
        href: "/mi-agenda",
        metadata: { solicitudId: solicitud.id, instanciaSalaId: instancia.id, asistenteTecnicoId: assistant.id },
        emailSubject: `Te asignaron una asistencia técnica: ${solicitud.titulo}`,
        emailText: `${detailsText}\n\nINSTRUCCIONES PARA EL ASISTENTE TÉCNICO:\n• Has sido configurado/a como anfitrión/co-anfitrión en Google Meet para esta reunión.\n• No es necesario iniciar sesión con la cuenta de la sala ni usar su contraseña.\n• Ingresá al enlace de Meet directamente con tu cuenta de Google vinculada para contar con permisos de moderación, admisión y grabación.`,
        emailActionLabel: "Abrir mi agenda"
      }
    );
    await notificarUsuarios(
      db,
      responsablesPrograma,
      {
        tipo: "ASISTENCIA_ASIGNACION",
        titulo: "Asistencia técnica asignada",
        cuerpo: `${solicitud.titulo} quedó asignada a ${assistantName || "la persona asignada"}.`,
        href: `/reuniones/${solicitud.id}`,
        metadata: { solicitudId: solicitud.id, instanciaSalaId: instancia.id, asistenteTecnicoId: assistant.id },
        emailSubject: `Asistencia técnica asignada: ${solicitud.titulo}`,
        emailText: `${detailsText}\n\nAsistencia técnica confirmada con: ${assistantName || assistant.usuario.id}.\n• El/la asistente técnico/a ingresará a Google Meet con su propia cuenta de Google como anfitrión/co-anfitrión para moderar y dar soporte técnico.\n• Docentes y estudiantes ingresan directamente a través del enlace de Google Meet sin requerir credenciales de sala.`,
        emailActionLabel: "Ver reunión"
      }
    );
  }

  if (!solicitud.requiereAsistenciaTecnica) return;
  const hasOpenAssistance = solicitud.instancias.some((instancia) => instancia.asignaciones.length === 0);
  if (!hasOpenAssistance) return;
  const assistants = await db.asistenteTecnico.findMany({
    where: {
      usuario: { activo: true, rol: "ASISTENTE_TECNICO" },
      disponibleGeneral: true,
      cesadoHastaProximoInicioSesion: false
    },
    select: { usuario: { select: { id: true, emailPrincipal: true } } }
  });
  await notificarUsuarios(
    db,
    assistants.map(({ usuario }) => ({ usuarioId: usuario.id, email: usuario.emailPrincipal })),
    {
      tipo: "ASISTENCIA_REQUERIDA",
      titulo: "Nueva reunión requiere asistencia técnica",
      cuerpo: `${solicitud.titulo} quedó abierta para postulaciones de asistencia técnica.`,
      href: "/agenda-abierta",
      metadata: { solicitudId: solicitud.id },
      emailSubject: `Asistencia técnica requerida: ${solicitud.titulo}`,
      emailText: `${detailsText}\n\nEsta reunión requiere asistencia técnica. Podés postularte desde Agenda abierta.\nAl ser asignado/a, tu cuenta de Google será configurada automáticamente como anfitriona en Google Meet para ingresar directamente a dar cobertura sin requerir credenciales de sala.`,
      emailActionLabel: "Ver agenda abierta"
    }
  );
}

function passwordCuenta(secretRef: string | null | undefined): string | null {
  if (!secretRef) return null;
  try {
    return descifrarConfiguracion(secretRef);
  } catch (error) {
    console.warn("No se pudo descifrar la contraseña de una cuenta Meet", error);
    return null;
  }
}

function capitalizar(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}
