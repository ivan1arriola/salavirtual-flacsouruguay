import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const form = readFileSync(new URL("../src/modules/reuniones/presentation/components/meeting-form-zoom.tsx", import.meta.url), "utf8");

const directorio = new URL("../src/modules/reuniones/presentation/components/nueva-reunion/", import.meta.url);
const fuente = [form, ...readdirSync(directorio).sort().map((archivo) => readFileSync(new URL(archivo, directorio), "utf8"))].join("\n");
const dialog = readFileSync(new URL("../src/modules/reuniones/presentation/components/meeting-creation-dialog.tsx", import.meta.url), "utf8");
const estilosA2 = readFileSync(new URL("nueva-reunion.module.css", directorio), "utf8");

describe("formulario de nueva reunión Zoom", () => {
  it("no menciona Google, cohosts ni invitados", () => {
    expect(fuente).not.toMatch(/google/i);
    expect(fuente).not.toMatch(/cohost/i);
    expect(fuente).not.toContain("guestEmails");
    expect(fuente).not.toContain("EmailListEditor");
  });

  it("el diálogo de creación que usa no menciona Google", () => {
    expect(dialog).not.toMatch(/google/i);
  });

  it("conserva el formulario sin cohosts ni invitados", () => {
    expect(fuente).not.toContain("cohostEmailsManual");
    expect(fuente).not.toContain("invitadosEmails");
  });

  it("no exige un correo del docente para habilitar la creación", () => {
    expect(fuente).not.toContain("teacherEmail");
    expect(form).toContain("const academicReady = title.trim().length >= 3 && Boolean(selectedProgram);");
  });

  it("conserva el bloqueo de envío y los atributos de accesibilidad", () => {
    expect(form).toContain('disabled={!isReady || status === "saving" || status === "done"}');
    expect(form).toContain('aria-busy={status === "saving"}');
    expect(form).toContain('role="alert"');
    expect(form).toContain("if (submittingRef.current) return;");
    expect(form).toContain("submittingRef.current = true;");
    expect(form).toContain("submittingRef.current = false;");
    expect(form).toContain("idempotencyKeyRef.current ||= window.crypto.randomUUID();");
    expect(form).toContain('"Idempotency-Key": idempotencyKeyRef.current');
    expect(form).not.toContain('idempotencyKeyRef.current = ""');
  });

  it("informa el enlace de Zoom pendiente en lugar de la configuración de Google", () => {
    expect(form).toContain("La reunión quedó guardada. El enlace de Zoom continúa pendiente.");
    expect(form).toContain("La reunión y sus enlaces de Zoom quedaron creados correctamente.");
  });

  it("las filas de fechas usan un identificador estable y no el índice como clave", () => {
    expect(fuente).not.toContain("key={index}");
    expect(fuente).toContain("key={date.id}");
  });

  it("tras un error de envío el foco pasa al mensaje", () => {
    expect(form).toContain("mensajeErrorRef");
    expect(form).toMatch(/mensajeErrorRef\.current\?\.focus\(\)/);
    expect(form).toContain("tabIndex={-1}");
  });

  it("conserva un solo POST construido por el helper y nunca presenta URLs de Zoom", () => {
    expect(form.match(/fetch\("\/api\/v1\/reuniones"/g)).toHaveLength(1);
    expect(form).toContain('method: "POST"');
    expect(form).toContain("JSON.stringify(construirSolicitudReunion({");
    expect(form).toContain("fechas: ordenarEncuentros(dates)");
    expect(fuente).not.toMatch(/start_url|join_url|zoom\.us\//);
    expect(form).toContain("resolverAsistenteTecnicoId({ puedeAsignar: canAssignAssistant");
  });

  it("invalida la vista previa al editar la regla y bloquea fechas obsoletas o más de 100 encuentros", () => {
    expect(form).toContain('dateMode !== "RECURRENT" || recurrenceGenerated');
    expect(form).toContain("dates.length <= 100");
    expect(form).toMatch(/function invalidarVistaPreviaRecurrencia\(\)[\s\S]*?setRecurrenceGenerated\(invalidada.recurrenceGenerated\)[\s\S]*?setDates\(invalidada.dates\)/);
    expect(form).toMatch(/function cambiarRecurrencia[\s\S]*?invalidarVistaPreviaRecurrencia\(\)/);
    expect(form).toMatch(/onChange=\{\(campo, value\)[^\n]*invalidarVistaPreviaRecurrencia\(\)/);
    expect(form).toContain("if (dates.length < 100)");
  });

  it("cambiar de modo solicita confirmación antes de mutar fechas y cancelar solo cierra el aviso", () => {
    expect(form).toMatch(/requiereConfirmacionCambio\(dateMode, mode, dates, recurrence\)\) \{\s*setPendingMode\(mode\);\s*return;/);
    expect(form).toContain("onCancel={() => setPendingMode(null)}");
    expect(form).toContain("if (pendingMode) return;");
    expect(form).toContain("fechasAlCambiarModo(mode, dates, nuevaFecha)");
  });

  it("la barra móvil se reserva por encima de la navegación inferior existente y su safe-area", () => {
    const movil = estilosA2.slice(estilosA2.indexOf("@media (max-width: 639px)"));
    // La navegación ocupa 54px + 12px de márgenes + borde; 74px deja separación.
    expect(movil).toMatch(/bottom:\s*calc\(74px \+ env\(safe-area-inset-bottom, 0px\)\)/);
    expect(movil).toMatch(/padding-bottom:\s*calc\(6rem \+ 74px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  });
});
