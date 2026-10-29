import {
  BookOpen,
  Clock3,
  History,
  KeyRound,
  LayoutDashboard,
  MailCheck,
  Settings,
  Video
} from "lucide-react";
import Link from "next/link";
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

  return (
    <div className="settings-center">
      <header className="settings-center__masthead">
        <div>
          <p className="page-eyebrow">Administración</p>
          <h1>Centro de configuración</h1>
          <p>Revisá el estado general y administrá cada área desde un solo lugar.</p>
        </div>
        <span className="settings-center__masthead-icon" aria-hidden="true"><Settings size={24} /></span>
      </header>

      <details className="settings-mobile-nav">
        <summary>
          <SectionIcon section={activeMetadata} />
          <span><small>Sección actual</small><strong>{activeMetadata.label}</strong></span>
          <span className="settings-mobile-nav__action">Cambiar sección</span>
        </summary>
        <nav aria-label="Secciones de configuración">
          {SETTINGS_SECTIONS.map((item) => (
            <SettingsNavLink
              active={item.id === activeSection}
              detail={navigationDetails?.[item.id]}
              item={item}
              key={item.id}
            />
          ))}
        </nav>
      </details>

      <div className="settings-center__layout">
        <aside className="settings-center__rail">
          <p className="settings-center__rail-label">Configuración</p>
          <nav aria-label="Secciones de configuración">
            {SETTINGS_SECTIONS.map((item) => (
              <SettingsNavLink
                active={item.id === activeSection}
                detail={navigationDetails?.[item.id]}
                item={item}
                key={item.id}
              />
            ))}
          </nav>
        </aside>
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
