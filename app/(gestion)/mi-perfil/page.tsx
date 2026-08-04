import { KeyRound, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TeacherProgramsForm } from "@/src/components/teacher-programs-form";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import {
  etiquetaTipoNotificacion,
  PREFERENCIA_PREDETERMINADA,
  TIPOS_NOTIFICACION
} from "@/src/modules/notificaciones/notificaciones.domain";
import {
  guardarPassword,
  guardarPerfil,
  guardarPreferenciasNotificacion,
  guardarProgramas
} from "./actions";

const messages: Readonly<Record<string, string>> = {
  "perfil-guardado": "Tus datos fueron actualizados.",
  "password-guardada": "Tu contraseña fue actualizada.",
  "programas-guardados": "Tus programas fueron actualizados.",
  "notificaciones-guardadas": "Tus preferencias de notificación fueron actualizadas.",
  "error-perfil": "No se pudieron guardar los datos. Revisá los campos.",
  "error-password": "No se pudo actualizar la contraseña. Revisá la contraseña actual y la confirmación.",
  "error-programas": "No se pudieron actualizar tus programas.",
  "error-notificaciones": "No se pudieron actualizar tus preferencias de notificación."
};

export default async function MiPerfilPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ estado?: string }> }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) redirect("/acceso");
  const [user, programs] = await Promise.all([
    db.usuario.findUnique({
      where: { id: actor.id },
      include: {
        cuentasGoogle: { orderBy: { email: "asc" } },
        preferenciasNotificacion: true,
        docente: { include: { programas: { where: { activo: true }, select: { programaId: true } } } }
      }
    }),
    actor.rol === "DOCENTE"
      ? db.programa.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } })
      : Promise.resolve([])
  ]);
  if (!user) redirect("/acceso");
  const { estado } = await searchParams;

  return (
    <>
      <header className="page-header">
        <div><p className="page-eyebrow">Cuenta personal</p><h1>Mi perfil</h1><p>Datos de contacto, accesos autorizados y seguridad.</p></div>
        <UserRound size={28} color="var(--brand)" aria-hidden="true" />
      </header>

      {estado && messages[estado] ? <p className="form-notice" role="status">{messages[estado]}</p> : null}
      <div className="profile-layout">
        <section className="content-section">
          <div className="section-heading"><div><h2>Datos personales</h2><p>La identificación de acceso no cambia desde aquí.</p></div></div>
          <form className="profile-form" action={guardarPerfil}>
            <div className="form-grid">
              <label className="field"><span>Nombre</span><input name="nombres" defaultValue={user.nombres} required maxLength={100} /></label>
              <label className="field"><span>Apellido</span><input name="apellidos" defaultValue={user.apellidos ?? ""} maxLength={120} /></label>
              <label className="field"><span>Teléfono</span><input name="telefono" type="tel" defaultValue={user.telefono ?? ""} maxLength={40} /></label>
              <label className="field"><span>URL de foto</span><input name="imagenUrl" type="url" defaultValue={user.imagenUrl ?? ""} maxLength={500} /></label>
            </div>
            <div className="form-actions"><span /><button className="primary-action" type="submit">Guardar datos</button></div>
          </form>
        </section>

        <section className="content-section">
          <div className="section-heading"><div><h2>Acceso</h2><p>Información administrada por FLACSO.</p></div></div>
          <dl className="profile-meta">
            <div><dt>Usuario</dt><dd>{user.id}</dd></div>
            <div><dt>Rol</dt><dd>{user.rol.toLowerCase()}</dd></div>
            <div><dt>Email principal</dt><dd>{user.emailPrincipal ?? "Sin email"}</dd></div>
            <div><dt>Cuentas Google</dt><dd>{user.cuentasGoogle.length === 0 ? "Sin cuentas vinculadas" : user.cuentasGoogle.map(({ email }) => email).join(", ")}</dd></div>
          </dl>
        </section>

        <section className="content-section settings-wide">
          <div className="section-heading"><div><h2>Contraseña</h2><p>{user.passwordHash ? "Ingresá la contraseña actual para cambiarla." : "Podés crear una contraseña como acceso alternativo."}</p></div><KeyRound size={20} color="var(--brand)" /></div>
          <form className="profile-form" action={guardarPassword}>
            <div className="form-grid">
              {user.passwordHash ? <label className="field field-wide"><span>Contraseña actual</span><input name="passwordActual" type="password" required autoComplete="current-password" /></label> : null}
              <label className="field"><span>Nueva contraseña</span><input name="passwordNueva" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></label>
              <label className="field"><span>Confirmar contraseña</span><input name="confirmarPassword" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></label>
            </div>
            <div className="form-actions"><span /><button className="primary-action" type="submit">Guardar contraseña</button></div>
          </form>
        </section>

        <section className="content-section settings-wide">
          <div className="section-heading">
            <div>
              <h2>Notificaciones</h2>
              <p>Elegí canales por tipo. Si no guardás cambios, el valor predeterminado es push y correo.</p>
            </div>
          </div>
          <form className="profile-form" action={guardarPreferenciasNotificacion}>
            <div className="notification-preferences">
              <div className="notification-preference-head">
                <span>Tipo</span>
                <span>Push</span>
                <span>Correo</span>
              </div>
              {TIPOS_NOTIFICACION.map((tipo) => {
                const preference = user.preferenciasNotificacion.find((item) => item.tipo === tipo) ?? PREFERENCIA_PREDETERMINADA;
                return (
                  <div className="notification-preference-row" key={tipo}>
                    <strong>{etiquetaTipoNotificacion(tipo)}</strong>
                    <label>
                      <input name={`${tipo}:push`} type="checkbox" defaultChecked={preference.push} />
                      <span className="sr-only">Push para {etiquetaTipoNotificacion(tipo)}</span>
                    </label>
                    <label>
                      <input name={`${tipo}:email`} type="checkbox" defaultChecked={preference.email} />
                      <span className="sr-only">Correo para {etiquetaTipoNotificacion(tipo)}</span>
                    </label>
                  </div>
                );
              })}
            </div>
            <div className="form-actions"><span /><button className="primary-action" type="submit">Guardar notificaciones</button></div>
          </form>
        </section>

        {actor.rol === "DOCENTE" ? (
          <TeacherProgramsForm
            programs={programs.map(({ id, nombre }) => ({ id, name: nombre }))}
            initialSelectedIds={user.docente?.programas.map(({ programaId }) => programaId) ?? []}
            saveAction={guardarProgramas}
          />
        ) : null}
      </div>
    </>
  );
}
