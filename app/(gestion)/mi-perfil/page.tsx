import { KeyRound, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import {
  etiquetaTipoNotificacion,
  PREFERENCIA_PREDETERMINADA,
  TIPOS_NOTIFICACION
} from "@/src/modules/notificaciones/notificaciones.domain";
import {
  guardarPassword,
  guardarDisponibilidad,
  guardarPerfil,
  guardarPreferenciasNotificacion
} from "./actions";

const messages: Readonly<Record<string, string>> = {
  "perfil-guardado": "Tus datos fueron actualizados.",
  "password-guardada": "Tu contraseña fue actualizada.",
  "notificaciones-guardadas": "Tus preferencias de notificación fueron actualizadas.",
  "disponibilidad-guardada": "Tu disponibilidad habitual fue actualizada.",
  "error-perfil": "No se pudieron guardar los datos. Revisá los campos.",
  "error-password": "No se pudo actualizar la contraseña. Revisá la contraseña actual y la confirmación.",
  "error-notificaciones": "No se pudieron actualizar tus preferencias de notificación.",
  "error-disponibilidad": "No se pudo actualizar tu disponibilidad. Revisá los horarios."
};

export default async function MiPerfilPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ estado?: string }> }>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) {
    redirect("/acceso");
  }
  const user = await db.usuario.findUnique({
    where: { id: actor.id },
    include: {
      cuentasGoogle: { orderBy: { email: "asc" } },
      preferenciasNotificacion: true,
      asistenteTecnico: {
        include: { disponibilidades: { where: { fecha: null }, orderBy: { diaSemana: "asc" } } }
      }
    }
  });
  if (!user) {
    redirect("/acceso");
  }
  const { estado } = await searchParams;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Cuenta personal</p>
          <h1>Mi perfil</h1>
          <p>Datos de contacto, accesos autorizados y seguridad.</p>
        </div>
        <UserRound size={28} color="var(--brand)" aria-hidden="true" />
      </header>

      {estado && messages[estado] ? (
        <p className="form-notice" role="status">
          {messages[estado]}
        </p>
      ) : null}
      <div className="profile-layout">
        <section className="content-section">
          <div className="section-heading">
            <div>
              <h2>Datos personales</h2>
              <p>La identificación de acceso no cambia desde aquí.</p>
            </div>
          </div>
          <form className="profile-form" action={guardarPerfil}>
            <div className="form-grid">
              <label className="field">
                <span>Nombre</span>
                <input name="nombres" defaultValue={user.nombres} required maxLength={100} />
              </label>
              <label className="field">
                <span>Apellido</span>
                <input name="apellidos" defaultValue={user.apellidos ?? ""} maxLength={120} />
              </label>
              <label className="field">
                <span>Teléfono</span>
                <input name="telefono" type="tel" defaultValue={user.telefono ?? ""} maxLength={40} />
              </label>
              <label className="field">
                <span>URL de foto</span>
                <input name="imagenUrl" type="url" defaultValue={user.imagenUrl ?? ""} maxLength={500} />
              </label>
            </div>
            <div className="form-actions">
              <span />
              <button className="primary-action" type="submit">
                Guardar datos
              </button>
            </div>
          </form>
        </section>

        <section className="content-section">
          <div className="section-heading">
            <div>
              <h2>Acceso</h2>
              <p>Información administrada por FLACSO.</p>
            </div>
          </div>
          <dl className="profile-meta">
            <div>
              <dt>Usuario</dt>
              <dd>{user.id}</dd>
            </div>
            <div>
              <dt>Rol</dt>
              <dd>{user.rol.toLowerCase()}</dd>
            </div>
            <div>
              <dt>Email principal</dt>
              <dd>{user.emailPrincipal ?? "Sin email"}</dd>
            </div>
            <div>
              <dt>Cuentas Google</dt>
              <dd>
                {user.cuentasGoogle.length === 0
                  ? "Sin cuentas vinculadas"
                  : user.cuentasGoogle.map(({ email }) => email).join(", ")}
              </dd>
            </div>
          </dl>
        </section>

        <section className="content-section settings-wide">
          <div className="section-heading">
            <div>
              <h2>Contraseña</h2>
              <p>
                {user.passwordHash
                  ? "Ingresá la contraseña actual para cambiarla."
                  : "Podés crear una contraseña como acceso alternativo."}
              </p>
            </div>
            <KeyRound size={20} color="var(--brand)" />
          </div>
          <form className="profile-form" action={guardarPassword}>
            <div className="form-grid">
              {user.passwordHash ? (
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
            <div className="form-actions">
              <span />
              <button className="primary-action" type="submit">
                Guardar contraseña
              </button>
            </div>
          </form>
        </section>

        <section className="content-section settings-wide">
          <div className="section-heading">
            <div>
              <h2>Notificaciones</h2>
              <p>Elegí qué avisos querés recibir dentro del sistema y por correo electrónico.</p>
            </div>
          </div>
          <form className="profile-form" action={guardarPreferenciasNotificacion}>
            <div className="notification-preferences">
              <div className="notification-preference-head">
                <span>Tipo</span>
                <span>En la app</span>
                <span>Por correo</span>
              </div>
              {TIPOS_NOTIFICACION.map((tipo) => {
                const preference =
                  user.preferenciasNotificacion.find((item) => item.tipo === tipo) ??
                  PREFERENCIA_PREDETERMINADA;
                return (
                  <div className="notification-preference-row" key={tipo}>
                    <strong>{etiquetaTipoNotificacion(tipo)}</strong>
                    <label>
                      <input name={`${tipo}:push`} type="checkbox" defaultChecked={preference.push} />
                      <span className="sr-only">En la aplicación para {etiquetaTipoNotificacion(tipo)}</span>
                    </label>
                    <label>
                      <input name={`${tipo}:email`} type="checkbox" defaultChecked={preference.email} />
                      <span className="sr-only">Correo para {etiquetaTipoNotificacion(tipo)}</span>
                    </label>
                  </div>
                );
              })}
            </div>
            <div className="form-actions">
              <span />
              <button className="primary-action" type="submit">
                Guardar notificaciones
              </button>
            </div>
          </form>
        </section>

        {actor.rol === "ASISTENTE_TECNICO" && user.asistenteTecnico ? (
          <section className="content-section settings-wide">
            <div className="section-heading">
              <div>
                <h2>Mi disponibilidad habitual</h2>
                <p>
                  Administración la usa para sugerir coberturas. Las excepciones por fecha tienen prioridad.
                </p>
              </div>
            </div>
            <form className="profile-form" action={guardarDisponibilidad}>
              <label className="availability-general">
                <input
                  name="disponibleGeneral"
                  type="checkbox"
                  defaultChecked={user.asistenteTecnico.disponibleGeneral}
                />
                <span>Disponible para recibir asignaciones</span>
              </label>
              <div className="availability-grid">
                {["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"].map(
                  (label, diaSemana) => {
                    const current = user.asistenteTecnico?.disponibilidades.find(
                      (item) => item.diaSemana === diaSemana
                    );
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
                  }
                )}
              </div>
              <div className="form-actions">
                <span />
                <button className="primary-action" type="submit">
                  Guardar disponibilidad
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </div>
    </>
  );
}
