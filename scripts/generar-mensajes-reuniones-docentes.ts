import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMeetingDigestEmail,
  firstName,
  formatRange,
  fullName,
  passwordSala
} from "./email-message-helpers";

const db = new PrismaClient();

async function main(): Promise<void> {
  const outDirArg = process.argv.find((arg) => arg.startsWith("--out-dir="));
  const outDir = outDirArg?.slice("--out-dir=".length);
  const now = new Date();

  const requests = await db.solicitudSala.findMany({
    where: {
      instancias: {
        some: {
          inicioProgramadoAt: { gte: now },
          estado: { in: ["PROGRAMADA", "EN_CURSO"] }
        }
      }
    },
    orderBy: { fechaInicioSolicitada: "asc" },
    select: {
      id: true,
      titulo: true,
      modalidad: true,
      requiereAsistenciaTecnica: true,
      requiereGrabacion: true,
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
      },
      instancias: {
        where: {
          inicioProgramadoAt: { gte: now },
          estado: { in: ["PROGRAMADA", "EN_CURSO"] }
        },
        orderBy: [{ inicioProgramadoAt: "asc" }, { id: "asc" }],
        select: {
          inicioProgramadoAt: true,
          finProgramadoAt: true,
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

  const byTeacher = new Map<string, typeof requests>();
  for (const request of requests) {
    const teacher = request.docentePrograma.docente.usuario;
    byTeacher.set(teacher.id, [...(byTeacher.get(teacher.id) ?? []), request]);
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

  for (const items of byTeacher.values()) {
    const teacher = items[0]?.docentePrograma.docente.usuario;
    if (!teacher) continue;

    const cards = items.map((request) => {
      const meet = request.instancias[0]?.eventosProveedor[0];
      const cuenta = meet?.cuentaProveedor;
      const observaciones = [
        request.requiereAsistenciaTecnica ? "requiere asistencia" : null,
        request.requiereGrabacion ? "requiere grabación" : null
      ].filter((item): item is string => Boolean(item));

      return {
        titulo: request.titulo,
        programa: request.docentePrograma.programa.nombre,
        modalidad: request.modalidad,
        fechas: request.instancias.map((instancia) =>
          formatRange(instancia.inicioProgramadoAt, instancia.finProgramadoAt)
        ),
        joinUrl: meet?.joinUrl,
        codigoReunion: meet?.codigoReunion,
        usuarioSala: cuenta?.emailOrganizador,
        passwordSala: passwordSala(cuenta),
        observaciones
      };
    });

    const subject = "Próximas reuniones Google Meet";
    const message = buildMeetingDigestEmail({
      greetingName: firstName(teacher),
      intro: "Te compartimos el detalle de tus próximas reuniones programadas. Cada bloque corresponde a una reunión; si tiene varias fechas, todas usan el mismo acceso Meet.",
      cards
    });
    const name = fullName(teacher);

    sections.push([
      `PARA: ${name} <${teacher.emailPrincipal ?? "sin email"}>`,
      `ASUNTO: ${subject}`,
      "",
      message.text
    ].join("\n"));

    if (outDir && teacher.emailPrincipal) {
      const safeEmail = teacher.emailPrincipal.replace(/[^a-z0-9._-]+/gi, "_");
      const baseFile = `${manifest.length + 1}-${safeEmail}`;
      const textFile = join(outDir, `${baseFile}.txt`);
      const htmlFile = join(outDir, `${baseFile}.html`);
      writeFileSync(textFile, message.text, "utf8");
      writeFileSync(htmlFile, message.html, "utf8");
      manifest.push({
        to: teacher.emailPrincipal,
        name,
        subject,
        body_file: textFile,
        text_file: textFile,
        html_file: htmlFile,
        meetings: items.length,
        instances: items.reduce((total, item) => total + item.instancias.length, 0)
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
