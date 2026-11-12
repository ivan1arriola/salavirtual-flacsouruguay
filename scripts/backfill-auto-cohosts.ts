import "dotenv/config";
import { db } from "../src/lib/db";
import { normalizeCohostEmails } from "../src/modules/meet/cohosts.domain";

const applyChanges = process.argv.includes("--apply");
const syncGoogle = process.argv.includes("--sync-google") && !process.argv.includes("--no-sync-google");
const syncAllGoogle = process.argv.includes("--sync-all-google");

async function main(): Promise<void> {
  const meetings = await db.instanciaSala.findMany({
    where: {
      inicioProgramadoAt: { gte: new Date() },
      estado: { in: ["PROGRAMADA", "EN_CURSO"] }
    },
    select: {
      id: true,
      eventosProveedor: {
        where: { proveedor: { tipo: "GOOGLE_MEET" } },
        select: { codigoReunion: true },
        take: 1
      },
      solicitud: {
        select: {
          creadaPor: {
            select: {
              emailPrincipal: true,
              cuentasGoogle: { select: { id: true } }
            }
          }
        }
      },
      asignaciones: {
        where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
        select: {
          asistenteTecnico: {
            select: {
              usuario: {
                select: {
                  emailPrincipal: true,
                  cuentasGoogle: { select: { id: true } }
                }
              }
            }
          }
        }
      },
      cohosts: { select: { cuentaGoogleId: true } },
      cohostEmails: { select: { email: true } }
    }
  });

  const plan = meetings.flatMap((meeting) => {
    const requester = meeting.solicitud.creadaPor;
    const assistants = meeting.asignaciones.map(({ asistenteTecnico }) => asistenteTecnico.usuario);
    const expectedAccountIds = new Set([
      ...requester.cuentasGoogle.map(({ id }) => id),
      ...assistants.flatMap((assistant) => assistant.cuentasGoogle.map(({ id }) => id))
    ]);
    const expectedEmails = normalizeCohostEmails([
      ...(requester.cuentasGoogle.length === 0 && requester.emailPrincipal ? [requester.emailPrincipal] : []),
      ...assistants.flatMap((assistant) =>
        assistant.cuentasGoogle.length === 0 && assistant.emailPrincipal ? [assistant.emailPrincipal] : []
      )
    ]);
    const currentAccountIds = new Set(meeting.cohosts.map(({ cuentaGoogleId }) => cuentaGoogleId));
    const currentEmails = new Set(meeting.cohostEmails.map(({ email }) => email.toLowerCase()));
    const missingAccountIds = [...expectedAccountIds].filter((id) => !currentAccountIds.has(id));
    const missingEmails = expectedEmails.filter((email) => !currentEmails.has(email));

    return missingAccountIds.length || missingEmails.length
      ? [
          {
            instanciaSalaId: meeting.id,
            missingAccountIds,
            missingEmails,
            hasMeetCode: Boolean(meeting.eventosProveedor[0]?.codigoReunion)
          }
        ]
      : [];
  });

  console.log(
    JSON.stringify(
      {
        mode: applyChanges ? "apply" : "dry-run",
        syncGoogle,
        syncAllGoogle,
        meetingsReviewed: meetings.length,
        instancesToUpdate: plan.length,
        googleAccountsToAdd: plan.reduce((total, item) => total + item.missingAccountIds.length, 0),
        emailCohostsToAdd: plan.reduce((total, item) => total + item.missingEmails.length, 0),
        instancesWithMeetCode: plan.filter(({ hasMeetCode }) => hasMeetCode).length,
        instancesToSyncWithGoogle: syncAllGoogle
          ? meetings.filter(({ eventosProveedor }) => eventosProveedor[0]?.codigoReunion).length
          : plan.filter(({ hasMeetCode }) => hasMeetCode).length
      },
      null,
      2
    )
  );

  if (!applyChanges) {
    return;
  }

  for (const item of plan) {
    if (item.missingAccountIds.length > 0) {
      await db.cohostReunion.createMany({
        data: item.missingAccountIds.map((cuentaGoogleId) => ({
          instanciaSalaId: item.instanciaSalaId,
          cuentaGoogleId
        })),
        skipDuplicates: true
      });
    }
    if (item.missingEmails.length > 0) {
      await db.cohostEmailReunion.createMany({
        data: item.missingEmails.map((email) => ({
          instanciaSalaId: item.instanciaSalaId,
          email
        })),
        skipDuplicates: true
      });
    }
  }

  const failures: Array<Readonly<{ instanciaSalaId: string; error: string }>> = [];
  if (syncGoogle) {
    const [{ descifrarConfiguracion }, { sincronizarCohostsDeInstancia }, { configurarGoogleMeetExistente }] =
      await Promise.all([
        import("../src/lib/config/encryption"),
        import("../src/modules/asistencia/asistencia.service"),
        import("../src/modules/meet/google-calendar.adapter")
      ]);
    const syncTargets = syncAllGoogle
      ? meetings
          .filter(({ eventosProveedor }) => eventosProveedor[0]?.codigoReunion)
          .map(({ id }) => ({ instanciaSalaId: id }))
      : plan.filter(({ hasMeetCode }) => hasMeetCode);
    for (const item of syncTargets) {
      try {
        await sincronizarCohostsDeInstancia(
          {
            db,
            descifrar: descifrarConfiguracion,
            configurarEspacio: configurarGoogleMeetExistente
          },
          item.instanciaSalaId
        );
      } catch (error) {
        failures.push({
          instanciaSalaId: item.instanciaSalaId,
          error: error instanceof Error ? error.message : "Error desconocido"
        });
      }
    }
  }

  console.log(JSON.stringify({ failures }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
