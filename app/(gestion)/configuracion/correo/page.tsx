import { EmailTestForm } from "@/src/components/email-test-form";
import {
  MailDeliveryDiagnostics,
  type EstadoCorreoAuditado
} from "@/src/components/mail-delivery-diagnostics";
import { SettingsBlock, SettingsNotices } from "@/src/components/settings-block";
import { SettingsCenterShell, SettingsSectionHeader } from "@/src/components/settings-center-shell";
import { SesEmailSettingsForm } from "@/src/components/ses-email-settings-form";
import { db } from "@/src/lib/db";
import { requireAdminPage } from "../require-admin-page";

export default async function ConfiguracionCorreoPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ estado?: string; error?: string }> }>) {
  const session = await requireAdminPage();
  const query = await searchParams;
  const [sesConfig, recentDeliveryAudits] = await Promise.all([
    db.configuracionCorreoSes.findUnique({ where: { id: "principal" } }),
    db.auditoria.findMany({
      where: { accion: "NOTIFICACION_CORREO_ESTADO" },
      orderBy: { createdAt: "desc" },
      take: 75,
      select: { id: true, createdAt: true, valorNuevo: true }
    })
  ]);

  const mailAttempts: readonly EstadoCorreoAuditado[] = recentDeliveryAudits.map((audit) => {
    const raw = audit.valorNuevo;
    const details =
      raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const estado =
      details.estado === "ACEPTADO" || details.estado === "OMITIDO" || details.estado === "ERROR"
        ? details.estado
        : "ERROR";
    return {
      id: audit.id,
      fecha: audit.createdAt.toISOString().replace("T", " ").slice(0, 19),
      tipo: typeof details.tipo === "string" ? details.tipo : "desconocido",
      estado,
      transporte: typeof details.transporte === "string" ? details.transporte : null,
      motivo: typeof details.motivo === "string" ? details.motivo : null
    };
  });
  const sesActiva = sesConfig?.activa ?? false;
  const sesEstado = sesActiva ? "Activo" : "Pausado";
  const sesResumen = sesConfig
    ? `${sesEstado} · remitente ${sesConfig.fromEmail}`
    : "Todavía no hay una configuración guardada.";

  return (
    <SettingsCenterShell activeSection="correo">
      <SettingsSectionHeader
        title="Correo"
        description="Canal utilizado para invitaciones y notificaciones."
      />
      <SettingsNotices
        error={query.error}
        estado={query.estado}
        mensajes={{ "correo-ses-actualizado": "La configuración de Amazon SES fue actualizada." }}
      />
      <SettingsBlock
        title="Amazon SES"
        summary={sesResumen}
        status={{ tone: sesActiva ? "ok" : "warning", label: sesActiva ? "Activo" : "Inactivo" }}
        defaultOpen={!sesConfig}
      >
        <SesEmailSettingsForm config={sesConfig} />
      </SettingsBlock>
      <h3 className="settings-subsection-title">Pruebas y diagnóstico</h3>
      <EmailTestForm defaultRecipient={session.user.email ?? ""} />
      <MailDeliveryDiagnostics attempts={mailAttempts} sesEnabled={sesActiva} />
    </SettingsCenterShell>
  );
}
