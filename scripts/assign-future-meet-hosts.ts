import { PrismaClient } from "@prisma/client";
import { asignarSalas } from "../src/modules/reuniones/asignacion-salas.domain";

const db = new PrismaClient();
const applyChanges = process.argv.includes("--apply");

async function main(): Promise<void> {
  try {
    const [provider, rooms, meetings] = await Promise.all([
      db.proveedorReunion.findUnique({ where: { tipo: "GOOGLE_MEET" } }),
      db.cuentaProveedor.findMany({
        where: {
          proveedor: { tipo: "GOOGLE_MEET" },
          activa: true,
          tieneLicencia: true,
        },
        orderBy: { prioridad: "asc" },
      }),
      db.instanciaSala.findMany({
        where: {
          inicioProgramadoAt: { gte: new Date() },
          estado: "PROGRAMADA",
          eventosProveedor: {
            some: { proveedor: { tipo: "ZOOM_HISTORICO" } },
            none: { proveedor: { tipo: "GOOGLE_MEET" } },
          },
        },
        orderBy: { inicioProgramadoAt: "asc" },
      }),
    ]);
    if (!provider) {
      throw new Error("No existe el proveedor Google Meet.");
    }

    const result = asignarSalas(
      meetings.map((meeting) => ({
        id: meeting.id,
        serieId: meeting.solicitudSalaId,
        inicio: meeting.inicioProgramadoAt,
        fin: meeting.finProgramadoAt,
      })),
      rooms,
    );
    if (!result.ok) {
      throw new Error(
        `No hay salas suficientes para ${result.reunionIdsSinSala.length} reuniones.`,
      );
    }
    console.log(
      JSON.stringify(
        {
          mode: applyChanges ? "apply" : "dry-run",
          futureMeetings: meetings.length,
          availableRooms: rooms.length,
          assignments: result.asignaciones.length,
        },
        null,
        2,
      ),
    );
    if (!applyChanges) {
      return;
    }

    await db.$transaction(
      result.asignaciones.map((assignment) =>
        db.eventoProveedor.create({
          data: {
            instanciaSalaId: assignment.reunionId,
            proveedorId: provider.id,
            cuentaProveedorId: assignment.salaId,
            estadoIntegracion: "PENDIENTE",
          },
        }),
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

void main();
