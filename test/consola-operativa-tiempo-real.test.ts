import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  controlOperativoReunionSchema,
  derivarEstadoGrabacionOperativa,
  derivarEstadoTranscripcionOperativa,
  registroAsistenciaOperativoSchema
} from "@/src/modules/reuniones/reunion-operativa.domain";

describe("consola operativa en tiempo real y registro de asistencia en base de datos", () => {
  it("deriva el estado de grabación en vivo (GRABANDO) y de transcripción (TRANSCRIBIENDO)", () => {
    expect(
      derivarEstadoGrabacionOperativa({
        requiereGrabacion: true,
        estadoReunion: "EN_CURSO",
        estadoProveedor: "PROCESANDO",
        grabandoEnVivo: true
      })
    ).toBe("GRABANDO");

    expect(
      derivarEstadoTranscripcionOperativa({
        transcribiendoEnVivo: true,
        estadoProveedor: "TRANSCRIBIENDO"
      })
    ).toBe("TRANSCRIBIENDO");

    expect(
      derivarEstadoTranscripcionOperativa({
        transcribiendoEnVivo: false,
        estadoProveedor: "AUSENTE"
      })
    ).toBe("NO_TRANSCRIBIENDO");
  });

  it("valida los esquemas de control remoto en tiempo real y registro de asistentes en DB", () => {
    const control = controlOperativoReunionSchema.parse({
      tipoAccesoMeet: "OPEN",
      requiereGrabacion: true,
      modalidad: "VIRTUAL",
      agregarCohostEmail: "cohost@flacso.edu.uy"
    });
    expect(control.tipoAccesoMeet).toBe("OPEN");
    expect(control.agregarCohostEmail).toBe("cohost@flacso.edu.uy");

    const asistente = registroAsistenciaOperativoSchema.parse({
      claveParticipante: "users/123",
      nombre: "Ana Pérez",
      email: "ana.perez@flacso.edu.uy",
      rolEnReunion: "COHOST",
      conectado: true,
      enGrupoPequeno: true,
      salaGrupoPequeno: "Grupo 2"
    });
    expect(asistente.email).toBe("ana.perez@flacso.edu.uy");
    expect(asistente.enGrupoPequeno).toBe(true);
    expect(asistente.salaGrupoPequeno).toBe("Grupo 2");
  });

  it("expone endpoint de control operativo y componentes de edición en tiempo real", () => {
    const routePath = join(
      process.cwd(),
      "app/api/v1/reuniones/instancias/[instanciaId]/control-operativo/route.ts"
    );
    expect(existsSync(routePath)).toBe(true);
    const routeSource = readFileSync(routePath, "utf8");
    expect(routeSource).toContain("export async function PATCH");
    expect(routeSource).toContain("export async function POST");
    expect(routeSource).toContain("actualizarControlOperativoReunion");
    expect(routeSource).toContain("guardarRegistroAsistenciaOperativo");

    const pageSource = readFileSync(
      join(process.cwd(), "src/bootstrap/ui/reuniones/reunion-operativa-page.server.tsx"),
      "utf8"
    );
    expect(pageSource).toContain("OperationalAttendeeDatabaseManager");
    expect(pageSource).toContain("OperationalRemoteControlPanel");
    expect(pageSource).toContain("Estado de grabación");
    expect(pageSource).toContain("Transcripción");
    expect(pageSource).toContain("Host / Cohosts en sala");
    expect(pageSource).toContain("Acceso a la reunión");
  });

  it("evita asignar el correo equivocado cuando existen homónimos y evita falsos positivos de grupos pequeños", () => {
    const adapterSource = readFileSync(
      join(
        process.cwd(),
        "src/modules/archivos/infrastructure/google/google-artifacts-provider.adapter.ts"
      ),
      "utf8"
    );
    expect(adapterSource).not.toContain('salaGrupoPequeno: enGrupoPequeno ? "Sala de grupo pequeño"');
    expect(adapterSource).toContain("mergedIntervals");

    const serverSource = readFileSync(
      join(process.cwd(), "src/bootstrap/reunion-operativa.server.ts"),
      "utf8"
    );
    expect(serverSource).toContain("crearIndiceUnicoPorNombre");
    expect(serverSource).toContain('"AMBIGUO"');
    expect(serverSource).toContain('operacionPendiente: "CONFIGURAR_MEET"');
  });
});

