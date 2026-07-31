import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const hosts = Array.from({ length: 10 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  return {
    nombre: `Sala ${number}`,
    email: `sala${number}@flacso.edu.uy`,
    prioridad: index + 1,
  };
});

async function main(): Promise<void> {
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
