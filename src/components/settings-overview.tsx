import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  Clock3,
  History,
  KeyRound,
  MailCheck,
  Video
} from "lucide-react";
import Link from "next/link";
import { settingsNeedsAttention } from "@/src/modules/configuracion/settings-navigation.domain";

export type SettingsOverviewData = Readonly<{
  workspaceReady: boolean;
  integrationActive: boolean;
  availableHosts: number;
  totalHosts: number;
  activePrograms: number;
  totalPrograms: number;
  pendingOperations: number;
}>;

export function SettingsOverview({ data }: Readonly<{ data: SettingsOverviewData }>) {
  const needsAttention = settingsNeedsAttention(data);

  return (
    <div className="settings-overview">
      <SettingsAttentionBanner data={data} needsAttention={needsAttention} />

      <div className="settings-overview-grid">
        <OverviewCard
          description={data.workspaceReady ? "Cuenta, delegación y Drive configurados" : "Faltan datos para completar la integración"}
          href="/configuracion?seccion=workspace"
          icon={<KeyRound size={22} />}
          label="Google Workspace"
          state={data.workspaceReady && data.integrationActive ? "ok" : "warning"}
          value={data.integrationActive ? "Integración activa" : "Integración pausada"}
        />
        <OverviewCard
          description={`${data.availableHosts} de ${data.totalHosts} disponibles para nuevas reuniones`}
          href="/configuracion?seccion=salas"
          icon={<Video size={22} />}
          label="Salas"
          state={data.availableHosts > 0 ? "ok" : "warning"}
          value={`${data.totalHosts} ${data.totalHosts === 1 ? "cuenta" : "cuentas"}`}
        />
        <OverviewCard
          description={`${data.activePrograms} activos · ${data.totalPrograms - data.activePrograms} inactivos`}
          href="/usuarios?vista=programas"
          icon={<BookOpen size={22} />}
          label="Programas"
          state="neutral"
          value={`${data.totalPrograms} ${data.totalPrograms === 1 ? "programa" : "programas"}`}
        />
        <OverviewCard
          description="Destinatarios de los reportes mensuales"
          href="/configuracion?seccion=asistencia"
          icon={<Clock3 size={22} />}
          label="Monitoreo"
          state="neutral"
          value="Configurar reportes"
        />
        <OverviewCard
          description="Comprueba el canal de invitaciones y avisos"
          href="/configuracion?seccion=correo"
          icon={<MailCheck size={22} />}
          label="Correo"
          state="neutral"
          value="Probar el envío"
        />
        <OverviewCard
          description="Registros migrados disponibles para consulta"
          href="/configuracion?seccion=historico"
          icon={<History size={22} />}
          label="Histórico Zoom"
          state="quiet"
          value="Abrir histórico"
        />
      </div>
    </div>
  );
}

function SettingsAttentionBanner({
  data,
  needsAttention
}: Readonly<{ data: SettingsOverviewData; needsAttention: boolean }>) {
  if (!needsAttention) {
    return (
      <section className="settings-attention settings-attention--ok" aria-label="Estado general">
        <span className="settings-attention__icon"><CheckCircle2 size={24} /></span>
        <div><strong>Todo está listo para operar</strong><p>La integración está activa, hay salas disponibles y no quedan operaciones pendientes.</p></div>
      </section>
    );
  }

  return (
    <section className="settings-attention settings-attention--warning" aria-label="Estado general">
      <span className="settings-attention__icon"><CircleAlert size={24} /></span>
      <div>
        <strong>Hay aspectos que requieren revisión</strong>
        <ul>
          {data.pendingOperations > 0 ? <li><Link href="/configuracion?seccion=workspace">{data.pendingOperations} {data.pendingOperations === 1 ? "operación pendiente" : "operaciones pendientes"} con Google</Link></li> : null}
          {!data.workspaceReady ? <li><Link href="/configuracion?seccion=workspace">Completar Google Workspace</Link></li> : null}
          {!data.integrationActive ? <li><Link href="/configuracion?seccion=workspace">Activar la integración de Google Workspace</Link></li> : null}
          {data.availableHosts === 0 ? <li><Link href="/configuracion?seccion=salas">Revisar las salas disponibles</Link></li> : null}
        </ul>
      </div>
    </section>
  );
}

function OverviewCard({
  description,
  href,
  icon,
  label,
  state,
  value
}: Readonly<{
  description: string;
  href: string;
  icon: React.ReactNode;
  label: string;
  state: "ok" | "warning" | "neutral" | "quiet";
  value: string;
}>) {
  return (
    <Link className={`settings-overview-card settings-overview-card--${state}`} href={href}>
      <span className="settings-overview-card__icon" aria-hidden="true">{icon}</span>
      <span className="settings-overview-card__copy">
        <small>{label}</small>
        <strong>{value}</strong>
        <span>{description}</span>
      </span>
      <ArrowRight className="settings-overview-card__arrow" size={18} aria-hidden="true" />
    </Link>
  );
}
