import { Bell, ChevronDown, LogOut, UserRound } from "lucide-react";
import type { Session } from "next-auth";
import Link from "next/link";
import { signOut } from "@/auth";
import { AccountSwitcher } from "@/src/components/account-switcher";
import { AssistantTutorialButton } from "@/src/modules/asistencia/presentation/components/assistant-tutorial-button";
import { DismissibleDetails } from "@/src/components/profile-menu-disclosure";
import { TeacherTutorialButton } from "@/src/components/teacher-tutorial-button";
import type { CuentaRecordada } from "@/src/modules/usuarios/cuentas-recordadas.domain";

export function ProfileMenu({
  user,
  account,
  unreadNotifications,
  compact = false,
}: Readonly<{
  user: Session["user"];
  account: CuentaRecordada;
  unreadNotifications: number;
  compact?: boolean;
}>) {
  const displayName = user.name ?? user.email ?? user.id;
  const className = ["profile-menu", compact ? "profile-menu-compact" : null]
    .filter(Boolean)
    .join(" ");

  return (
    <DismissibleDetails className={className} dataTour={profileTourForRole(user.role)}>
      <summary
        aria-label={`Abrir menú de perfil${unreadNotifications > 0 ? `, ${unreadNotifications} notificaciones sin leer` : ""}`}
        data-tour={notificationTourForRole(user.role)}
      >
        <span className="avatar" aria-hidden="true">
          <UserAvatarContent imageUrl={user.image} name={displayName} />
        </span>
        {!compact ? (
          <>
            <span className="account-copy">
              <strong>{displayName}</strong>
              <small>{roleLabel(user.role)}</small>
            </span>
            <ChevronDown className="profile-menu-chevron" size={17} aria-hidden="true" />
          </>
        ) : null}
        {unreadNotifications > 0 ? (
          <strong className="profile-menu-notification-count" aria-hidden="true">
            {unreadNotifications}
          </strong>
        ) : null}
      </summary>

      <div className="profile-menu-card">
        <div className="profile-menu-identity">
          <span className="avatar profile-menu-avatar" aria-hidden="true">
            <UserAvatarContent imageUrl={user.image} name={displayName} />
          </span>
          <span>
            <strong>{displayName}</strong>
            <small>{user.email ?? roleLabel(user.role)}</small>
            <em>{roleLabel(user.role)}</em>
          </span>
        </div>

        <div className="profile-menu-actions">
          <Link
            aria-label={`Notificaciones${unreadNotifications > 0 ? `, ${unreadNotifications} sin leer` : ""}`}
            className="profile-menu-action"
            href="/notificaciones"
          >
            <Bell size={18} aria-hidden="true" />
            <span>Notificaciones</span>
            {unreadNotifications > 0 ? (
              <strong className="profile-menu-action-badge">{unreadNotifications}</strong>
            ) : null}
          </Link>
          <Link className="profile-menu-action" href="/mi-perfil">
            <UserRound size={18} aria-hidden="true" />
            <span>Mi perfil</span>
          </Link>
          <AccountSwitcher account={account} />
          {user.role === "DOCENTE" ? <TeacherTutorialButton /> : null}
          {user.role === "ASISTENTE_TECNICO" ? <AssistantTutorialButton /> : null}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/acceso" });
            }}
          >
            <button className="profile-menu-action profile-menu-logout" type="submit">
              <LogOut size={18} aria-hidden="true" />
              <span>Cerrar sesión</span>
            </button>
          </form>
        </div>
      </div>
    </DismissibleDetails>
  );
}

function profileTourForRole(role: Session["user"]["role"]): string | undefined {
  if (role === "DOCENTE") {
    return "teacher-profile";
  }
  if (role === "ASISTENTE_TECNICO") {
    return "assistant-profile";
  }
  return undefined;
}

function notificationTourForRole(role: Session["user"]["role"]): string | undefined {
  if (role === "DOCENTE") {
    return "teacher-notifications";
  }
  if (role === "ASISTENTE_TECNICO") {
    return "assistant-notifications";
  }
  return undefined;
}

function roleLabel(role: Session["user"]["role"]): string {
  if (role === "ADMINISTRACION") {
    return "Administración";
  }
  if (role === "ASISTENTE_TECNICO") {
    return "Asistente técnico";
  }
  return "Docente";
}

function UserAvatarContent({
  imageUrl,
  name,
}: Readonly<{ imageUrl?: string | null; name: string }>) {
  return (
    <>
      <span className="avatar-fallback" aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </span>
      {imageUrl ? (
        <span
          className="avatar-image"
          style={{ backgroundImage: `url(${JSON.stringify(imageUrl)})` }}
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}
