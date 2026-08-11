import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMeetingDigestEmail,
  firstName,
  formatRange,
  fullName,
  passwordSala,
  type MeetingEmailCard
} from "./email-message-helpers";

const db = new PrismaClient();

async function main(): Promise<void> {
  const outDirArg = process.argv.find((arg) => arg.startsWith("--out-dir="));
  const outDir = outDirArg?.slice("--out-dir=".length);
  const now = new Date();

  const assignments = await db.asignacionAsistenciaTecnica.findMany({
    where: {
      estado: { in: ["ASIGNADO", "ACEPTADO"] },
      asistenteTecnico: { cesadoHastaProximoInicioSesion: false },
      instancia: {
        inicioProgramadoAt: { gte: now },
        estado: { in: ["PROGRAMADA", "EN_CURSO"] }
      }
    },
    orderBy: [{ instancia: { inicioProgramadoAt: "asc" } }, { id: "asc" }],
    select: {
      estado: true,
      asistenteTecnico: {
        select: {
          usuario: {
            select: {
              id: true,
              nombres: true,
              apellidos: true,
              emailPrincipal: true
            }
          }
        }
      },
      instancia: {
        select: {
          inicioProgramadoAt: true,
          finProgramadoAt: true,
          requiereAsistenciaTecnica: true,
          requiereGrabacion: true,
          solicitud: {
            select: {
              id: true,
              titulo: true,
              modalidad: true,
              docentePrograma: {
                select: {
                  programa: { select: { nombre: true } },
                  docente: {
                    select: {
                      usuario: {
                        select: { nombres: true, apellidos: true, emailPrincipal: true }
                      }
                    }
                  }
                }
              }
            }
          },
          eventosProveedor: {
            where: { proveedor: { tipo: "GOOGLE_MEET" } },
            select: {
              joinUrl: true,
              codigoReunion: true,
              cuentaProveedor: { select: { nombre: true, emailOrganizador: true } }
            }
          }
        }
      }
    }
  });

  const byAssistant = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const assistant = assignment.asistenteTecnico.usuario;
    byAssistant.set(assistant.id, [...(byAssistant.get(assistant.id) ?? []), assignment]);
  }

  const sections: string[] = [];
  const manifest: {
    to: string;
    name: string;
    subject: string;
    body_file: string;
    text_file: string;
    html_file: string;
    meetings: number;
    instances: number;
  }[] = [];

  if (outDir) mkdirSync(outDir, { recursive: true });

  for (const items of byAssistant.values()) {
    const assistant = items[0]?.asistenteTecnico.usuario;
    if (!assistant) continue;

    const cardsByRequest = new Map<string, MeetingEmailCard>();
    for (const assignment of items) {
      const meeting = assignment.instancia;
      const request = meeting.solicitud;
      const meet = meeting.eventosProveedor[0];
      const cuenta = meet?.cuentaProveedor;
      const teacher = request.docentePrograma.docente.usuario;
      const teacherName = fullName(teacher);
      const current = cardsByRequest.get(request.id);
      const fecha = formatRange(meeting.inicioProgramadoAt, meeting.finProgramadoAt);
      const observaciones = [
        meeting.requiereAsistenciaTecnica ? "requiere asistencia" : null,
        meeting.requiereGrabacion ? "requiere grabación" : null
      ].filter((item): item is string => Boolean(item));

      if (current) {
        cardsByRequest.set(request.id, {
          ...current,
          fechas: [...current.fechas, fecha],
          estadoAsignacion: mergeAssignmentState(current.estadoAsignacion, assignment.estado)
        });
        continue;
      }

      cardsByRequest.set(request.id, {
        titulo: request.titulo,
        programa: request.docentePrograma.programa.nombre,
        docente: `${teacherName}${teacher.emailPrincipal ? ` <${teacher.emailPrincipal}>` : ""}`,
        modalidad: request.modalidad,
        fechas: [fecha],
        joinUrl: meet?.joinUrl,
        codigoReunion: meet?.codigoReunion,
        usuarioSala: cuenta?.emailOrganizador,
        passwordSala: passwordSala(cuenta),
        observaciones,
        estadoAsignacion: assignment.estado === "ACEPTADO" ? "Confirmada" : "Asignada"
      });
    }

    const cards = [...cardsByRequest.values()];
    const subject = "Próximas asistencias asignadas Google Meet";
    const message = buildMeetingDigestEmail({
      greetingName: firstName(assistant),
      intro: "Te compartimos el detalle de tus próximas asistencias asignadas. Cada bloque corresponde a una reunión; si tiene varias fechas, todas usan el mismo acceso Meet.",
      cards
    });
    const name = fullName(assistant);

    sections.push([
      `PARA: ${name} <${assistant.emailPrincipal ?? "sin email"}>`,
      `ASUNTO: ${subject}`,
      "",
      message.text
    ].join("\n"));

    if (outDir && assistant.emailPrincipal) {
      const safeEmail = assistant.emailPrincipal.replace(/[^a-z0-9._-]+/gi, "_");
      const baseFile = `${manifest.length + 1}-${safeEmail}`;
      const textFile = join(outDir, `${baseFile}.txt`);
      const htmlFile = join(outDir, `${baseFile}.html`);
      writeFileSync(textFile, message.text, "utf8");
      writeFileSync(htmlFile, message.html, "utf8");
      manifest.push({
        to: assistant.emailPrincipal,
        name,
        subject,
        body_file: textFile,
        text_file: textFile,
        html_file: htmlFile,
        meetings: cards.length,
        instances: items.length
      });
    }
  }

  if (outDir) {
    writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  console.log(sections.join("\n\n---\n\n"));
}

function mergeAssignmentState(current: string | undefined, next: string): string {
  if (current === "Asignada" || next === "ASIGNADO") return "Asignada";
  return "Confirmada";
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
