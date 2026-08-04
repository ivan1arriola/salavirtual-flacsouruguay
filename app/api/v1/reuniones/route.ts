import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { crearGoogleCalendarProvider } from "@/src/modules/meet/google-calendar.adapter";
import { provisionarEventosMeet } from "@/src/modules/meet/provisionar-eventos.service";
import { notificarUsuario, notificarUsuarios, reunionEmailText } from "@/src/modules/notificaciones/notificaciones.service";
import { crearReuniones } from "@/src/modules/reuniones/crear-reuniones.service";
import { formatDateTime } from "@/src/lib/ui/format";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const input = await request.json().catch(() => null);

  try {
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
    );
    const provisionamiento = await provisionarEventosMeet(
      {
        db,
        descifrar: descifrarConfiguracion,
        crearProvider: crearGoogleCalendarProvider,
      },
      result.eventoProveedorIds,
    );
    const advertencias: string[] = [];
    try {
      await notificarReunionCreada(result.solicitudId);
    } catch (error) {
      console.warn("La reunion se creo, pero no se pudieron generar todas las notificaciones", error);
      advertencias.push("La reunion se creo correctamente, pero algunas notificaciones no pudieron enviarse.");
    }
    const { eventoProveedorIds: _, ...reunion } = result;
    return NextResponse.json(
      { ...reunion, provisionamiento, ...(advertencias.length > 0 ? { advertencias } : {}) },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Datos invalidos.";
    return NextResponse.json({ error: message }, { status: 400 });
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
            include: { asistente: { include: { usuario: true } } }
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
  const instancias = solicitud.instancias.map((instancia) => {
    const meet = instancia.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
    return {
      inicio: formatDateTime(instancia.inicioProgramadoAt),
      fin: formatDateTime(instancia.finProgramadoAt),
      sala: meet?.cuentaProveedor?.nombre,
      meet: meet?.codigoReunion,
      joinUrl: meet?.joinUrl
    };
  });
  const detailsText = reunionEmailText({
    titulo: solicitud.titulo,
    programa: solicitud.docentePrograma.programa.nombre,
    docente: docenteNombre,
    modalidad: solicitud.modalidad,
    requiereAsistencia: solicitud.requiereAsistencia,
    requiereGrabacion: solicitud.requiereGrabacion,
    instancias
  });
  await notificarUsuarios(
    db,
    [
      { usuarioId: solicitud.creadaPor.id, email: solicitud.creadaPor.emailPrincipal },
      { usuarioId: docenteUsuario.id, email: docenteUsuario.emailPrincipal }
    ],
    {
      tipo: "REUNION_CREADA",
      titulo: "Reunion creada",
      cuerpo: `${solicitud.titulo} quedo registrada con ${solicitud.instancias.length} instancia(s).`,
      href: `/reuniones/${solicitud.id}`,
      metadata: { solicitudId: solicitud.id },
      emailSubject: `Reunion creada: ${solicitud.titulo}`,
      emailText: detailsText
    }
  );

  const assignedAssistants = solicitud.instancias.flatMap((instancia) =>
    instancia.asignaciones.map((assignment) => ({
      instancia,
      assistant: assignment.asistente
    }))
  );
  for (const { instancia, assistant } of assignedAssistants) {
    const assistantName = [assistant.usuario.nombres, assistant.usuario.apellidos].filter(Boolean).join(" ");
    await notificarUsuario(
      db,
      { usuarioId: assistant.usuario.id, email: assistant.usuario.emailPrincipal },
      {
        tipo: "ASISTENCIA_ASIGNACION",
        titulo: "Te asignaron una reunion",
        cuerpo: `${solicitud.titulo} quedo asignada a tu agenda de asistencia.`,
        href: "/mi-agenda",
        metadata: { solicitudId: solicitud.id, instanciaSalaId: instancia.id, asistenteId: assistant.id },
        emailSubject: `Te asignaron una asistencia: ${solicitud.titulo}`,
        emailText: `${detailsText}\n\nAsistente asignado: ${assistantName || assistant.usuario.id}`
      }
    );
    await notificarUsuarios(
      db,
      [
        { usuarioId: solicitud.creadaPor.id, email: solicitud.creadaPor.emailPrincipal },
        { usuarioId: docenteUsuario.id, email: docenteUsuario.emailPrincipal }
      ],
      {
        tipo: "ASISTENCIA_ASIGNACION",
        titulo: "Asistencia asignada",
        cuerpo: `${solicitud.titulo} quedo asignada a ${assistantName || "la persona asignada"}.`,
        href: `/reuniones/${solicitud.id}`,
        metadata: { solicitudId: solicitud.id, instanciaSalaId: instancia.id, asistenteId: assistant.id },
        emailSubject: `Asistencia asignada: ${solicitud.titulo}`,
        emailText: `${detailsText}\n\nAsistente asignado: ${assistantName || assistant.usuario.id}`
      }
    );
  }

  if (!solicitud.requiereAsistencia) return;
  const hasOpenAssistance = solicitud.instancias.some((instancia) => instancia.asignaciones.length === 0);
  if (!hasOpenAssistance) return;
  const assistants = await db.asistente.findMany({
    where: { usuario: { activo: true, rol: "ASISTENTE" }, disponibleGeneral: true },
    select: { usuario: { select: { id: true, emailPrincipal: true } } }
  });
  await notificarUsuarios(
    db,
    assistants.map(({ usuario }) => ({ usuarioId: usuario.id, email: usuario.emailPrincipal })),
    {
      tipo: "ASISTENCIA_REQUERIDA",
      titulo: "Nueva reunion requiere asistencia",
      cuerpo: `${solicitud.titulo} quedo abierta para postulaciones de asistencia.`,
      href: "/agenda-abierta",
      metadata: { solicitudId: solicitud.id },
      emailSubject: `Asistencia requerida: ${solicitud.titulo}`,
      emailText: `${detailsText}\n\nEsta reunion requiere asistencia. Podes postularte desde Agenda abierta.`
    }
  );
}
