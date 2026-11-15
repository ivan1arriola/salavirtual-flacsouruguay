import { BookOpen, Clock3, History, KeyRound, LayoutDashboard, MailCheck, Video } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import {
  SETTINGS_SECTIONS,
  settingsHref,
  type SettingsSection,
  type SettingsSectionMetadata
} from "@/src/modules/configuracion/settings-navigation.domain";

const SETTINGS_ICONS = {
  overview: LayoutDashboard,
  workspace: KeyRound,
  zoom: Video,
  rooms: Video,
  programs: BookOpen,
  assistance: Clock3,
  email: MailCheck,
  history: History
} as const;

export function SettingsCenterShell({
  activeSection,
  children,
  navigationDetails
}: Readonly<{
  activeSection: SettingsSection;
  children: React.ReactNode;
  navigationDetails?: Partial<Record<SettingsSection, string>>;
}>) {
  const activeMetadata = SETTINGS_SECTIONS.find(({ id }) => id === activeSection) ?? SETTINGS_SECTIONS[0];
  // En el Resumen las tarjetas ya son la navegación: mostrar además el menú de áreas la duplicaba.
  const overview = activeSection === "resumen";

  return (
    <div className="settings-center">
      <header className="settings-center__masthead">
        <div>
          <p className="page-eyebrow">Administración</p>
          <h1>Centro de configuración</h1>
          <p>Revisá el estado general y administrá cada área desde un solo lugar.</p>
        </div>
      </header>

      {overview ? null : (
        <details className="settings-mobile-nav">
          <summary>
            <SectionIcon section={activeMetadata} />
            <span>
              <small>Sección actual</small>
              <strong>{activeMetadata.label}</strong>
            </span>
            <span className="settings-mobile-nav__action">Cambiar sección</span>
          </summary>
          <SettingsNavList activeSection={activeSection} navigationDetails={navigationDetails} />
        </details>
      )}

      <div className={`settings-center__layout${overview ? " settings-center__layout--solo" : ""}`}>
        {overview ? null : (
          <aside className="settings-center__rail">
            <p className="settings-center__rail-label">Configuración</p>
            <SettingsNavList activeSection={activeSection} navigationDetails={navigationDetails} />
          </aside>
        )}
        <div className="settings-center__content">{children}</div>
      </div>
    </div>
  );
}

export function SettingsSectionHeader({
  description,
  eyebrow,
  status,
  title
}: Readonly<{
  description: string;
  eyebrow?: string;
  status?: React.ReactNode;
  title: string;
}>) {
  return (
    <header className="settings-section-hero">
      <div>
        <p className="settings-section-hero__eyebrow">{eyebrow ?? "Configuración"}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {status ? <div className="settings-section-hero__status">{status}</div> : null}
    </header>
  );
}

function SettingsNavList({
  activeSection,
  navigationDetails
}: Readonly<{
  activeSection: SettingsSection;
  navigationDetails?: Partial<Record<SettingsSection, string>>;
}>) {
  return (
    <nav aria-label="Secciones de configuración">
      {SETTINGS_SECTIONS.map((item, index) => (
        <Fragment key={item.id}>
          {item.group && item.group !== SETTINGS_SECTIONS[index - 1]?.group ? (
            <p className="settings-nav-group">{item.group}</p>
          ) : null}
          <SettingsNavLink
            active={item.id === activeSection}
            detail={navigationDetails?.[item.id]}
            item={item}
          />
        </Fragment>
      ))}
    </nav>
  );
}

function SettingsNavLink({
  active,
  detail,
  item
}: Readonly<{
  active: boolean;
  detail?: string;
  item: SettingsSectionMetadata;
}>) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={active ? "is-active" : undefined}
      href={settingsHref(item.id)}
    >
      <SectionIcon section={item} />
      <span>
        <strong>{item.label}</strong>
        <small>{detail ?? item.description}</small>
      </span>
    </Link>
  );
}

function SectionIcon({ section }: Readonly<{ section: SettingsSectionMetadata }>) {
  const Icon = SETTINGS_ICONS[section.icon];
  return <Icon size={19} aria-hidden="true" />;
}
