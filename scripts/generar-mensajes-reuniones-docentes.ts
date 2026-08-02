import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const db = new PrismaClient();
const timezone = "America/Montevideo";

const dateFormatter = new Intl.DateTimeFormat("es-UY", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: timezone
});

const timeFormatter = new Intl.DateTimeFormat("es-UY", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: timezone
});

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatRange(inicio: Date, fin: Date): string {
  return `${capitalize(dateFormatter.format(inicio))}, ${timeFormatter.format(inicio)} a ${timeFormatter.format(fin)} h`;
}

function obtenerNumeroSala(
  cuenta: Readonly<{ nombre: string; emailOrganizador: string | null }> | null | undefined
): string | null {
  const source = [cuenta?.emailOrganizador, cuenta?.nombre].filter(Boolean).join(" ");
  const match = source.match(/sala\s*0?(\d{1,2})/i);
  return match ? match[1].padStart(2, "0") : null;
}

function passwordSala(
  cuenta: Readonly<{ nombre: string; emailOrganizador: string | null }> | null | undefined
): string | null {
  const numero = obtenerNumeroSala(cuenta);
  return numero ? `Sala${numero}FLACSO+` : null;
}

async function main(): Promise<void> {
  const outDirArg = process.argv.find((arg) => arg.startsWith("--out-dir="));
  const outDir = outDirArg?.slice("--out-dir=".length);
  const now = new Date();
  const meetings = await db.instanciaSala.findMany({
    where: {
      inicioProgramadoAt: { gte: now },
      estado: { in: ["PROGRAMADA", "EN_CURSO"] }
    },
    orderBy: [{ inicioProgramadoAt: "asc" }, { id: "asc" }],
    select: {
      ordinal: true,
      inicioProgramadoAt: true,
      finProgramadoAt: true,
      requiereAsistencia: true,
      requiereGrabacion: true,
      solicitud: {
        select: {
          titulo: true,
          modalidad: true,
          docentePrograma: {
            select: {
              programa: { select: { nombre: true } },
              docente: {
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
  });

  const byTeacher = new Map<string, typeof meetings>();
  for (const meeting of meetings) {
    const teacher = meeting.solicitud.docentePrograma.docente.usuario;
    byTeacher.set(teacher.id, [...(byTeacher.get(teacher.id) ?? []), meeting]);
  }

  const sections: string[] = [];
  const manifest: {
    to: string;
    name: string;
    subject: string;
    body_file: string;
    meetings: number;
  }[] = [];

  if (outDir) {
    mkdirSync(outDir, { recursive: true });
  }

  for (const items of byTeacher.values()) {
    const teacher = items[0]?.solicitud.docentePrograma.docente.usuario;
    if (!teacher) continue;

    const fullName = [teacher.nombres, teacher.apellidos].filter(Boolean).join(" ");
    const firstName = teacher.nombres.replace(/,+$/, "");
    const lines = items.map((meeting, index) => {
      const meet = meeting.eventosProveedor[0];
      const password = passwordSala(meet?.cuentaProveedor);
      const notes = [
        meeting.requiereAsistencia ? "requiere asistencia" : null,
        meeting.requiereGrabacion ? "requiere grabación" : null
      ].filter(Boolean);

      return [
        `${index + 1}. ${formatRange(meeting.inicioProgramadoAt, meeting.finProgramadoAt)}`,
        `   ${meeting.solicitud.titulo}`,
        `   Programa: ${meeting.solicitud.docentePrograma.programa.nombre}`,
        `   Encuentro: ${meeting.ordinal}`,
        `   Modalidad: ${meeting.solicitud.modalidad}`,
        meet?.joinUrl ? `   Link: ${meet.joinUrl}` : "   Link: pendiente de provisión",
        meet?.codigoReunion ? `   Código Meet: ${meet.codigoReunion}` : null,
        meet?.cuentaProveedor?.emailOrganizador
          ? `   Usuario sala: ${meet.cuentaProveedor.emailOrganizador}`
          : null,
        password ? `   Contraseña sala: ${password}` : null,
        notes.length ? `   Observaciones: ${notes.join("; ")}` : null
      ].filter(Boolean).join("\n");
    });

    const subject = "Próximas reuniones Google Meet";
    const body = [
      "",
      `Hola ${firstName},`,
      "",
      "Te compartimos el detalle de tus próximas reuniones programadas:",
      "",
      lines.join("\n\n"),
      "",
      "Saludos,",
      "Equipo FLACSO Uruguay"
    ].join("\n").trimStart();

    sections.push([
      `PARA: ${fullName} <${teacher.emailPrincipal ?? "sin email"}>`,
      `ASUNTO: ${subject}`,
      "",
      body
    ].join("\n"));

    if (outDir && teacher.emailPrincipal) {
      const safeEmail = teacher.emailPrincipal.replace(/[^a-z0-9._-]+/gi, "_");
      const bodyFile = join(outDir, `${manifest.length + 1}-${safeEmail}.txt`);
      writeFileSync(bodyFile, body, "utf8");
      manifest.push({
        to: teacher.emailPrincipal,
        name: fullName,
        subject,
        body_file: bodyFile,
        meetings: items.length
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

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
