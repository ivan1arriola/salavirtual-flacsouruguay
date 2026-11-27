import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const hosts = (process.env["MEET_HOST_EMAILS"] ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)
  .map((email, index) => ({
    nombre: `Sala Meet ${index + 1}`,
    email,
    prioridad: index + 1,
  }));

async function main(): Promise<void> {
  if (hosts.length === 0) {
    throw new Error(
      "No hay cuentas configuradas. Definí MEET_HOST_EMAILS con los correos separados por comas o agregalas desde Configuración > Salas Meet.",
    );
  }

  try {
    const provider = await db.proveedorReunion.upsert({
      where: { tipo: "GOOGLE_MEET" },
      create: {
        tipo: "GOOGLE_MEET",
        nombre: "Google Meet",
        operativo: true,
        historico: false,
      },
      update: { operativo: true, historico: false },
    });

    await Promise.all(
      hosts.map((host) =>
        db.cuentaProveedor.upsert({
          where: {
            proveedorId_externalAccountId: {
              proveedorId: provider.id,
              externalAccountId: host.email,
            },
          },
          create: {
            proveedorId: provider.id,
            nombre: host.nombre,
            emailOrganizador: host.email,
            externalAccountId: host.email,
            prioridad: host.prioridad,
            tieneLicencia: true,
            activa: true,
          },
          update: {
            nombre: host.nombre,
            emailOrganizador: host.email,
            prioridad: host.prioridad,
            tieneLicencia: true,
            activa: true,
          },
        }),
      ),
    );

    console.log(JSON.stringify({ meetHostsConfigured: hosts.length }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

void main();
