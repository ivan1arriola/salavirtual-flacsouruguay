import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const form = readFileSync(new URL("../src/modules/reuniones/presentation/components/meeting-form-zoom.tsx", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../src/modules/reuniones/presentation/components/meeting-creation-dialog.tsx", import.meta.url), "utf8");

describe("formulario de nueva reunión Zoom", () => {
  it("no menciona Google, cohosts ni invitados", () => {
    expect(form).not.toMatch(/google/i);
    expect(form).not.toMatch(/cohost/i);
    expect(form).not.toContain("guestEmails");
    expect(form).not.toContain("EmailListEditor");
  });

  it("el diálogo de creación que usa no menciona Google", () => {
    expect(dialog).not.toMatch(/google/i);
  });

  it("envía la plataforma Zoom sin cohosts ni invitados", () => {
    expect(form).toContain('plataforma: "ZOOM"');
    expect(form).not.toContain("cohostEmailsManual");
    expect(form).not.toContain("invitadosEmails");
  });

  it("no exige un correo del docente para habilitar la creación", () => {
    expect(form).not.toContain("teacherEmail");
    expect(form).toContain("const academicReady = title.trim().length >= 3 && Boolean(selectedProgram);");
  });

  it("conserva el bloqueo de envío y los atributos de accesibilidad", () => {
    expect(form).toContain('disabled={!isReady || status === "saving" || status === "done"}');
    expect(form).toContain('aria-busy={status === "saving"}');
    expect(form).toContain('role="alert"');
  });

  it("envía modalidad VIRTUAL cuando no se pide asistente técnico", () => {
    expect(form).toContain('modalidad: requiresAssistance ? meetingMode : "VIRTUAL"');
  });

  it("informa el enlace de Zoom pendiente en lugar de la configuración de Google", () => {
    expect(form).toContain("La reunión quedó guardada. El enlace de Zoom continúa pendiente.");
    expect(form).toContain("La reunión y sus enlaces de Zoom quedaron creados correctamente.");
  });

  it("las filas de fechas usan un identificador estable y no el índice como clave", () => {
    expect(form).not.toContain("key={index}");
    expect(form).toContain("key={date.id}");
  });

  it("el identificador de la fila no viaja al servidor", () => {
    const instancias = form.match(/instancias: dates\.map\(\(\{([^}]*)\}\)/)?.[1] ?? "";
    expect(instancias).toContain("fecha");
    expect(instancias).not.toMatch(/id/);
  });

  it("tras un error de envío el foco pasa al mensaje", () => {
    expect(form).toContain("mensajeErrorRef");
    expect(form).toMatch(/mensajeErrorRef\.current\?\.focus\(\)/);
    expect(form).toContain("tabIndex={-1}");
  });
});
