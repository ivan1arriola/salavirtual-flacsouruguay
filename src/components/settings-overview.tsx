import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  Clock3,
  History,
  KeyRound,
  MailCheck,
  Video,
} from "lucide-react";
import Link from "next/link";
import {
  settingsHref,
  settingsNeedsAttention,
} from "@/src/modules/configuracion/settings-navigation.domain";

const TEXTO_VALOR_CREDENCIALES: Readonly<Record<string, string>> = {
  AUSENTES: "Sin credenciales activas y completas",
  ERROR_COMPROBACION: "No se pudieron comprobar las credenciales",
};

const TEXTO_AVISO_CREDENCIALES: Readonly<Record<string, string>> = {
  AUSENTES: "No hay credenciales Zoom activas y completas disponibles.",
  ERROR_COMPROBACION: "No se pudieron comprobar las credenciales.",
};

export type SettingsOverviewData = Readonly<{
  workspaceReady: boolean;
  integrationActive: boolean;
  zoomAvailableHosts: number;
  zoomCredentialsAvailable: boolean;
  zoomCredentialsDiagnostic?: "AUSENTES" | "ERROR_COMPROBACION";
  totalHosts: number;
  activePrograms: number;
  totalPrograms: number;
}>;

export function SettingsOverview({ data }: Readonly<{ data: SettingsOverviewData }>) {
  const needsAttention = settingsNeedsAttention(data);

  return (
    <div className="settings-overview">
      <SettingsAttentionBanner data={data} needsAttention={needsAttention} />
      <GoogleAttention data={data} />

      <div className="settings-overview-grid">
        <OverviewCard
          description="Credenciales Server-to-Server OAuth"
          href={settingsHref("zoom")}
          icon={<Video size={22} />}
          label="Zoom"
          state={data.zoomCredentialsAvailable ? "neutral" : "warning"}
          value={
            data.zoomCredentialsAvailable
              ? "Credenciales disponibles"
              : (TEXTO_VALOR_CREDENCIALES[data.zoomCredentialsDiagnostic ?? ""] ??
                "Disponibilidad sin confirmar")
          }
        />
        <OverviewCard
          description={
            data.workspaceReady
              ? "Cuenta, delegación y Drive configurados"
              : "Faltan datos para completar la integración"
          }
          href={settingsHref("google")}
          icon={<KeyRound size={22} />}
          label="Google"
          state={data.workspaceReady && data.integrationActive ? "ok" : "warning"}
          value={data.integrationActive ? "Integración activa" : "Integración pausada"}
        />
        <OverviewCard
          description={`${data.zoomAvailableHosts} cuentas Zoom habilitadas; la disponibilidad depende del horario`}
          href={settingsHref("salas")}
          icon={<Video size={22} />}
          label="Salas"
          state={data.zoomAvailableHosts > 0 ? "ok" : "warning"}
          value={`${data.totalHosts} ${data.totalHosts === 1 ? "cuenta Zoom" : "cuentas Zoom"} en total`}
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
          href={settingsHref("notificaciones")}
          icon={<Clock3 size={22} />}
          label="Notificaciones"
          state="neutral"
          value="Configurar reportes"
        />
        <OverviewCard
          description="Canal de invitaciones y avisos"
          href={settingsHref("correo")}
          icon={<MailCheck size={22} />}
          label="Correo"
          state="neutral"
          value="Configurar y probar el envío"
        />
        <OverviewCard
          description="Registros migrados disponibles para consulta"
          href={settingsHref("historico")}
          icon={<History size={22} />}
          label="Registros Zoom importados"
          state="quiet"
          value="Consultar registros"
        />
      </div>
    </div>
  );
}

/** Caja de aviso: el ícono va siempre, porque el CSS la reparte en ícono + texto. */
function Attention({
  tone,
  label,
  children,
}: Readonly<{ tone: "ok" | "warning"; label: string; children: React.ReactNode }>) {
  const Icon = tone === "ok" ? CheckCircle2 : CircleAlert;
  return (
    <section className={`settings-attention settings-attention--${tone}`} aria-label={label}>
      <span className="settings-attention__icon">
        <Icon size={24} />
      </span>
      <div>{children}</div>
    </section>
  );
}

function SettingsAttentionBanner({
  data,
  needsAttention,
}: Readonly<{ data: SettingsOverviewData; needsAttention: boolean }>) {
  if (!needsAttention) {
    return (
      <Attention tone="ok" label="Estado general">
        <strong>Configuración local de Zoom disponible</strong>
        <p>
          Hay credenciales y cuentas Zoom habilitadas. La conexión con Zoom no se verificó aquí.
        </p>
      </Attention>
    );
  }

  return (
    <Attention tone="warning" label="Estado general">
      <strong>Hay aspectos que requieren revisión</strong>
      <ul>
        {!data.zoomCredentialsAvailable ? (
          <li>
            {TEXTO_AVISO_CREDENCIALES[data.zoomCredentialsDiagnostic ?? ""] ??
              "No se pudo confirmar la disponibilidad de credenciales."}{" "}
            <Link href={settingsHref("zoom")}>Revisar credenciales de Zoom</Link>
          </li>
        ) : null}
        {data.zoomAvailableHosts === 0 ? (
          <li>
            <Link href={settingsHref("salas")}>Revisar las cuentas Zoom habilitadas</Link>
          </li>
        ) : null}
      </ul>
      <p>La conexión con Zoom no se verificó aquí.</p>
    </Attention>
  );
}

function GoogleAttention({ data }: Readonly<{ data: SettingsOverviewData }>) {
  if (data.workspaceReady && data.integrationActive) {
    return null;
  }
  return (
    <Attention tone="warning" label="Estado de Google">
      <strong>Google requiere revisión</strong>
      <ul>
        {!data.workspaceReady ? (
          <li>
            <Link href={settingsHref("google")}>Completar la configuración de Google</Link>
          </li>
        ) : null}
        {!data.integrationActive ? (
          <li>
            <Link href={settingsHref("google")}>Activar la integración de Google</Link>
          </li>
        ) : null}
      </ul>
    </Attention>
  );
}

function OverviewCard({
  description,
  href,
  icon,
  label,
  state,
  value,
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
      <span className="settings-overview-card__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="settings-overview-card__copy">
        <small>{label}</small>
        <strong>{value}</strong>
        <span>{description}</span>
      </span>
      <ArrowRight className="settings-overview-card__arrow" size={18} aria-hidden="true" />
    </Link>
  );
}
