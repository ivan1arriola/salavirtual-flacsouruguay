import type { Prisma } from "@prisma/client";
import { UserRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import {
  etiquetaTipoNotificacion,
  PREFERENCIA_PREDETERMINADA,
  type TipoNotificacion
} from "@/src/modules/notificaciones/notificaciones.domain";
import {
  guardarDisponibilidad,
  guardarPassword,
  guardarPerfil,
  guardarPreferenciasNotificacion
} from "./actions";
import { tiposNotificacionPerfil } from "./preferencias";
import "./profile.css";

const profileSelect = {
  id: true,
  nombres: true,
  apellidos: true,
  telefono: true,
  emailPrincipal: true,
  rol: true,
  passwordHash: true,
  debeCambiarPassword: true,
  cuentasGoogle: { orderBy: { email: "asc" }, select: { email: true } },
  preferenciasNotificacion: { select: { tipo: true, push: true, email: true } },
  asistenteTecnico: {
    select: {
      disponibleGeneral: true,
      disponibilidades: {
        where: { fecha: null },
        orderBy: { diaSemana: "asc" },
        select: { diaSemana: true, horaDesde: true, horaHasta: true, tipo: true }
      }
    }
  }
} satisfies Prisma.UsuarioSelect;

type Profile = Prisma.UsuarioGetPayload<{ select: typeof profileSelect }>;

const labels = {
  ADMINISTRACION: "Administración",
  DOCENTE: "Docente",
  ASISTENTE_TECNICO: "Asistencia técnica"
} as const;

const messages = new Map([
  ["perfil-guardado", "Tus datos fueron actualizados."],
  ["password-guardada", "Tu contraseña fue actualizada."],
  ["notificaciones-guardadas", "Tus preferencias de notificación fueron actualizadas."],
  ["disponibilidad-guardada", "Tu disponibilidad habitual fue actualizada."],
  ["error-perfil", "No se pudieron guardar los datos. Revisá los campos."],
  ["error-password", "No se pudo actualizar la contraseña. Revisá la contraseña actual y la confirmación."],
  ["error-notificaciones", "No se pudieron actualizar tus preferencias de notificación."],
  ["error-disponibilidad", "No se pudo actualizar tu disponibilidad. Revisá los horarios."]
]);

const dias = [
  [1, "Lunes"],
  [2, "Martes"],
  [3, "Miércoles"],
  [4, "Jueves"],
  [5, "Viernes"],
  [6, "Sábado"],
  [0, "Domingo"]
] as const;

function ProfilePanel({
  title,
  description,
  children
}: Readonly<{ title: string; description?: string; children: ReactNode }>) {
  return (
    <section className="content-section profile-panel" aria-labelledby="profile-panel-title">
      <div className="section-heading">
        <div>
          <h2 id="profile-panel-title">{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function PersonalPanel({ user }: Readonly<{ user: Profile }>) {
  return (
    <ProfilePanel title="Datos personales">
      <form className="profile-form" action={guardarPerfil}>
        <div className="form-grid">
          <label className="field">
            <span>Nombre</span>
            <input
              name="nombres"
              autoComplete="given-name"
              defaultValue={user.nombres}
              required
              maxLength={100}
            />
          </label>
          <label className="field">
            <span>Apellido</span>
            <input
              name="apellidos"
              autoComplete="family-name"
              defaultValue={user.apellidos ?? ""}
              maxLength={120}
            />
          </label>
          <label className="field">
            <span>Teléfono</span>
            <input
              name="telefono"
              type="tel"
              autoComplete="tel"
              defaultValue={user.telefono ?? ""}
              maxLength={40}
            />
          </label>
        </div>
        <div className="profile-save">
          <button className="primary-action" type="submit">
            Guardar datos
          </button>
        </div>
      </form>
    </ProfilePanel>
  );
}

function AccessPanel({ user }: Readonly<{ user: Profile }>) {
  const tienePassword = Boolean(user.passwordHash);
  const cuentas = user.cuentasGoogle.filter(({ email }) => email !== user.emailPrincipal);
  const description = tienePassword
    ? "Ingresá tu contraseña actual para cambiarla."
    : "Creá una contraseña para ingresar también con usuario o correo.";

  return (
    <ProfilePanel title="Acceso y contraseña" description={description}>
      {!user.emailPrincipal ? (
        <p className="profile-access-info">
          Usuario de acceso <strong>{user.id}</strong>
        </p>
      ) : null}
      {cuentas.length > 0 ? (
        <div className="profile-access-info">
          <strong>Otras cuentas de Google autorizadas</strong>
          <ul>
            {cuentas.map(({ email }) => (
              <li key={email}>{email}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <form className="profile-form" action={guardarPassword}>
        <div className="form-grid">
          {tienePassword ? (
            <label className="field field-wide">
              <span>Contraseña actual</span>
              <input name="passwordActual" type="password" required autoComplete="current-password" />
            </label>
          ) : null}
          <label className="field">
            <span>Nueva contraseña</span>
            <input
              name="passwordNueva"
              type="password"
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
            />
          </label>
          <label className="field">
            <span>Confirmar contraseña</span>
            <input
              name="confirmarPassword"
              type="password"
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
            />
          </label>
        </div>
        <div className="profile-save">
          <button className="primary-action" type="submit">
            Guardar contraseña
          </button>
        </div>
      </form>
    </ProfilePanel>
  );
}

function NotificationsPanel({
  tipos,
  preferencias
}: Readonly<{ tipos: readonly TipoNotificacion[]; preferencias: Profile["preferenciasNotificacion"] }>) {
  return (
    <ProfilePanel title="Notificaciones" description="Elegí cómo recibir los avisos de Sala Virtual.">
      <form className="profile-form" action={guardarPreferenciasNotificacion}>
        <div className="notification-preferences">
          <div className="notification-preference-head">
            <span>Tipo</span>
            <span>En la app</span>
            <span>Por correo</span>
          </div>
          {tipos.map((tipo) => {
            const preference = preferencias.find((item) => item.tipo === tipo) ?? PREFERENCIA_PREDETERMINADA;
            const label = etiquetaTipoNotificacion(tipo);
            return (
              <div className="notification-preference-row" key={tipo}>
                <strong>{label}</strong>
                <label>
                  <input name={`${tipo}:push`} type="checkbox" defaultChecked={preference.push} />
                  <span className="sr-only">En la aplicación para {label}</span>
                </label>
                <label>
                  <input name={`${tipo}:email`} type="checkbox" defaultChecked={preference.email} />
                  <span className="sr-only">Correo para {label}</span>
                </label>
              </div>
            );
          })}
        </div>
        <div className="profile-save">
          <button className="primary-action" type="submit">
            Guardar notificaciones
          </button>
        </div>
      </form>
    </ProfilePanel>
  );
}

function AvailabilityPanel({ asistente }: Readonly<{ asistente: NonNullable<Profile["asistenteTecnico"]> }>) {
  return (
    <ProfilePanel
      title="Disponibilidad habitual"
      description="Administración la usa para sugerir coberturas. Las excepciones por fecha tienen prioridad."
    >
      <form className="profile-form" action={guardarDisponibilidad}>
        <label className="availability-general">
          <input name="disponibleGeneral" type="checkbox" defaultChecked={asistente.disponibleGeneral} />
          <span>Disponible para recibir asignaciones</span>
        </label>
        <div className="availability-grid">
          {dias.map(([diaSemana, label]) => {
            const current = asistente.disponibilidades.find((item) => item.diaSemana === diaSemana);
            return (
              <div className="availability-row" key={label}>
                <label>
                  <input
                    name={`dia-${diaSemana}:activo`}
                    type="checkbox"
                    defaultChecked={Boolean(current)}
                  />
                  <strong>{label}</strong>
                </label>
                <input
                  aria-label={`Desde ${label}`}
                  name={`dia-${diaSemana}:desde`}
                  type="time"
                  defaultValue={current?.horaDesde ?? "09:00"}
                />
                <input
                  aria-label={`Hasta ${label}`}
                  name={`dia-${diaSemana}:hasta`}
                  type="time"
                  defaultValue={current?.horaHasta ?? "18:00"}
                />
                <select
                  aria-label={`Tipo ${label}`}
                  name={`dia-${diaSemana}:tipo`}
                  defaultValue={current?.tipo ?? "DISPONIBLE"}
                >
                  <option value="DISPONIBLE">Disponible</option>
                  <option value="PREFERENTE">Preferente</option>
                  <option value="NO_DISPONIBLE">No disponible</option>
                </select>
              </div>
            );
          })}
        </div>
        <div className="profile-save">
          <button className="primary-action" type="submit">
            Guardar disponibilidad
          </button>
        </div>
      </form>
    </ProfilePanel>
  );
}

export default async function MiPerfilPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ estado?: string; seccion?: string }> }>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) {
    redirect("/acceso");
  }
  const user = await db.usuario.findUnique({ where: { id: actor.id }, select: profileSelect });
  if (!user) {
    redirect("/acceso");
  }

  const { estado, seccion } = await searchParams;
  const mensaje = estado ? messages.get(estado) : undefined;
  const alerta = estado?.startsWith("error-");
  const nombre = [user.nombres, user.apellidos].filter(Boolean).join(" ");
  const sections = [
    { id: "datos", label: "Mis datos", panel: <PersonalPanel user={user} /> },
    { id: "acceso", label: "Acceso y contraseña", panel: <AccessPanel user={user} /> },
    {
      id: "notificaciones",
      label: "Notificaciones",
      panel: (
        <NotificationsPanel
          tipos={tiposNotificacionPerfil(actor.rol)}
          preferencias={user.preferenciasNotificacion}
        />
      )
    }
  ];
  if (actor.rol === "ASISTENTE_TECNICO" && user.asistenteTecnico) {
    sections.push({
      id: "disponibilidad",
      label: "Disponibilidad",
      panel: <AvailabilityPanel asistente={user.asistenteTecnico} />
    });
  }
  const active = sections.find(({ id }) => id === seccion) ?? sections[0];
  const panel = user.debeCambiarPassword ? <AccessPanel user={user} /> : active.panel;

  return (
    <div className="my-profile">
      <header className="profile-identity">
        <span className="profile-identity-icon">
          <UserRound aria-hidden="true" size={26} />
        </span>
        <div>
          <h1>Mi perfil</h1>
          <strong>{nombre}</strong>
          {user.emailPrincipal ? <p>{user.emailPrincipal}</p> : null}
        </div>
        <span className="profile-role">{labels[user.rol]}</span>
      </header>

      {user.debeCambiarPassword ? (
        <p className="form-notice">Actualizá tu contraseña para completar el acceso a Sala Virtual.</p>
      ) : (
        <nav className="profile-sections" aria-label="Opciones de Mi perfil">
          {sections.map(({ id, label }) => (
            <Link
              key={id}
              href={`/mi-perfil?seccion=${id}`}
              aria-current={active.id === id ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}

      {mensaje ? (
        <p className={alerta ? "inline-error" : "form-notice"} role={alerta ? "alert" : "status"}>
          {mensaje}
        </p>
      ) : null}
      {panel}
    </div>
  );
}
