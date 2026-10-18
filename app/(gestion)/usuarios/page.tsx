import { ChevronRight, GraduationCap, ShieldCheck, UserRoundCheck, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/src/lib/db";
import { ProgramMembersConfig } from "@/src/components/program-members-config";
import { resolveUsersView } from "@/src/modules/usuarios/users-view.domain";
import {
  actualizarProgramaAdmin,
  agregarIntegrantePrograma,
  crearProgramaAdmin,
  eliminarProgramaAdmin,
  invitarIntegrantePrograma,
  quitarIntegrantePrograma
} from "../configuracion/actions";
import {
  aprobarSolicitudAccesoGoogle,
  enviarInvitacion,
  rechazarSolicitudAccesoGoogle
} from "./actions";

const USER_TYPES = [
  { value: "ADMINISTRACION", label: "Administración", title: "Administración", icon: ShieldCheck },
  { value: "DOCENTE", label: "Docentes", title: "Docentes", icon: GraduationCap },
  { value: "ASISTENTE_TECNICO", label: "Asistentes de monitoreo", title: "Asistentes de monitoreo", icon: UserRoundCheck }
] as const;

type UserType = (typeof USER_TYPES)[number]["value"];

export default async function UsuariosPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ tipo?: string; vista?: string; programa?: string; estado?: string; error?: string }> }>) {
  const session = await auth();
  if (session?.user.role !== "ADMINISTRACION") redirect("/");
  const query = await searchParams;
  const view = resolveUsersView(query.vista);
  const selectedType = isUserType(query.tipo) ? query.tipo : "DOCENTE";
  const [users, groupedCounts, programs, solicitudesPendientes, programsForManagement, teachers] = await Promise.all([
    view === "personas" ? db.usuario.findMany({
      where: { rol: selectedType },
      orderBy: [{ apellidos: "asc" }, { nombres: "asc" }],
      include: {
        cuentasGoogle: { select: { email: true } },
        asistenteTecnico: { select: { cesadoHastaProximoInicioSesion: true } }
      }
    }) : Promise.resolve([]),
    db.usuario.groupBy({ by: ["rol"], _count: { _all: true } }),
    view === "personas" ? db.programa.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true }
    }) : Promise.resolve([]),
    view === "personas" ? db.solicitudAccesoGoogle.findMany({
      where: { estado: "PENDIENTE" },
      orderBy: { createdAt: "asc" }
    }) : Promise.resolve([]),
    view === "programas" ? db.programa.findMany({
      orderBy: { nombre: "asc" },
      select: {
        id: true, nombre: true, codigo: true, activo: true,
        docentes: {
          where: { activo: true },
          select: { docente: { select: { usuario: { select: { id: true, nombres: true, apellidos: true, emailPrincipal: true, activo: true } } } } }
        }
      }
    }) : Promise.resolve([]),
    view === "programas" ? db.usuario.findMany({
      where: { rol: "DOCENTE", activo: true },
      orderBy: [{ apellidos: "asc" }, { nombres: "asc" }],
      select: { id: true, nombres: true, apellidos: true, emailPrincipal: true, activo: true }
    }) : Promise.resolve([])
  ]);
  const selected = USER_TYPES.find(({ value }) => value === selectedType) ?? USER_TYPES[1];
  const total = groupedCounts.reduce((sum, group) => sum + group._count._all, 0);

  return (
    <>
      <header className="page-header">
        <div><p className="page-eyebrow">Administración</p><h1>Personas y programas</h1><p>{view === "personas"
          ? `${total} identidades registradas.`
          : `${programsForManagement.length} programas · ${programsForManagement.filter(({ activo }) => activo).length} activos.`}</p></div>
        <Users size={28} color="var(--brand)" />
      </header>

      <nav className="user-type-tabs user-domain-tabs" aria-label="Administración de personas y programas">
        <Link aria-current={view === "personas" ? "page" : undefined} className={view === "personas" ? "is-active" : undefined} href="/usuarios?vista=personas">Personas</Link>
        <Link aria-current={view === "programas" ? "page" : undefined} className={view === "programas" ? "is-active" : undefined} href="/usuarios?vista=programas">Programas</Link>
      </nav>

      {view === "personas" && query.estado === "invitacion-enviada" ? <p className="form-notice">La invitación fue creada y enviada.</p> : null}
      {view === "personas" && query.estado === "invitacion-creada" ? <p className="form-notice">El usuario fue creado. El correo no está configurado, por lo que deberás compartirle el acceso.</p> : null}
      {view === "personas" && query.estado === "solicitud-aprobada" ? <p className="form-notice">La solicitud fue aprobada y el usuario fue creado.</p> : null}
      {view === "personas" && query.estado === "solicitud-rechazada" ? <p className="form-notice">La solicitud fue rechazada y eliminada de pendientes.</p> : null}
      {view === "personas" && query.estado === "usuario-eliminado" ? <p className="form-notice">El usuario y sus datos asociados fueron eliminados.</p> : null}
      {query.error ? <p className="form-notice form-notice-error" role="alert">{query.error}</p> : null}

      {view === "personas" && solicitudesPendientes.length ? (
        <section className="content-section">
          <div className="section-heading"><div><h2>Solicitudes de acceso pendientes</h2><p>Las cuentas externas requieren autorización antes de poder ingresar.</p></div></div>
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Persona</th><th>Cuenta Google</th><th>Solicitada</th><th>Acciones</th></tr></thead>
            <tbody>{solicitudesPendientes.map((solicitud) => (
              <tr key={solicitud.id}>
                <td><strong>{solicitud.nombres} {solicitud.apellidos}</strong></td>
                <td>{solicitud.email}</td>
                <td>{solicitud.createdAt.toLocaleDateString("es-UY")}</td>
                <td>
                  <form action={aprobarSolicitudAccesoGoogle} className="inline-form">
                    <input name="solicitudId" type="hidden" value={solicitud.id} />
                    <select name="rol" defaultValue="DOCENTE">
                      <option value="DOCENTE">Docente</option>
                      <option value="ASISTENTE_TECNICO">Asistente de monitoreo</option>
                      <option value="ADMINISTRACION">Administración</option>
                    </select>
                    <button className="primary-action" type="submit">Aprobar</button>
                  </form>
                  <form action={rechazarSolicitudAccesoGoogle} className="inline-form">
                    <input name="solicitudId" type="hidden" value={solicitud.id} />
                    <button className="secondary-action" type="submit">Rechazar</button>
                  </form>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      ) : null}

      {view === "personas" ? <details className="content-section invitation-panel">
        <summary>Invitar una persona</summary>
        <form className="profile-form" action={enviarInvitacion}>
          <div className="form-grid">
            <label className="field"><span>Nombre</span><input name="nombres" required maxLength={100} /></label>
            <label className="field"><span>Apellido</span><input name="apellidos" maxLength={120} /></label>
            <label className="field"><span>Correo</span><input name="email" type="email" required placeholder="persona@ejemplo.com" /></label>
            <label className="field"><span>Rol</span><select name="rol" defaultValue="DOCENTE"><option value="DOCENTE">Docente</option><option value="ASISTENTE_TECNICO">Asistente de monitoreo</option><option value="ADMINISTRACION">Administración</option></select></label>
            <label className="field"><span>Programa existente (si es docente)</span><select name="programaId" defaultValue=""><option value="">Seleccionar</option>{programs.map(({ id, nombre }) => <option key={id} value={id}>{nombre}</option>)}</select></label>
            <label className="field"><span>O crear programa</span><input name="programaNuevo" maxLength={180} placeholder="Nombre del programa" /></label>
          </div>
          <p className="invitation-help">Podés invitar cualquier dirección de correo. Para docentes elegí un programa o escribí uno nuevo; para otros roles dejá ambos campos vacíos.</p>
          <div className="form-actions"><span /><button className="primary-action" type="submit">Crear y enviar invitación</button></div>
        </form>
      </details> : null}

      {view === "personas" ? <nav className="user-type-tabs" aria-label="Tipo de usuario">
        {USER_TYPES.map(({ value, label, icon: Icon }) => {
          const count = groupedCounts.find(({ rol }) => rol === value)?._count._all ?? 0;
          return (
            <Link
              aria-current={selectedType === value ? "page" : undefined}
              className={selectedType === value ? "is-active" : undefined}
              href={`/usuarios?tipo=${value}`}
              key={value}
            >
              <Icon size={18} /><span>{label}</span><strong>{count}</strong>
            </Link>
          );
        })}
      </nav> : null}

      {view === "personas" ? <section className="content-section">
        <div className="section-heading user-list-heading">
          <div><h2>{selected.title}</h2><p>{users.length} {users.length === 1 ? "usuario" : "usuarios"} en este grupo.</p></div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Usuario</th><th>Cuentas Google</th><th>Acceso</th><th></th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><strong>{user.nombres} {user.apellidos}</strong><small>{user.id} · {user.emailPrincipal ?? "sin email principal"}</small></td>
                  <td>{user.cuentasGoogle.length ? user.cuentasGoogle.map(({ email }) => email).join(", ") : <span className="muted-text">Sin cuenta</span>}</td>
                  <td>
                    <span className={`status ${
                      !user.activo
                        ? "status-error"
                        : user.asistenteTecnico?.cesadoHastaProximoInicioSesion
                          ? "status-warning"
                          : "status-ok"
                    }`}>
                      {!user.activo
                        ? "Inactivo"
                        : user.asistenteTecnico?.cesadoHastaProximoInicioSesion
                          ? "Cesado hasta próximo inicio"
                          : "Activo"}
                    </span>
                  </td>
                  <td><Link className="icon-link" href={`/usuarios/${encodeURIComponent(user.id)}`} title="Gestionar usuario"><ChevronRight size={18} /><span className="sr-only">Gestionar usuario</span></Link></td>
                </tr>
              ))}
              {users.length === 0 ? <tr><td className="empty-table-cell" colSpan={4}>No hay usuarios en este grupo.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section> : (
        <>
          {query.estado ? <p className="form-notice" role="status">{programStateMessage(query.estado)}</p> : null}
          <ProgramMembersConfig
            programs={programsForManagement.map((program) => ({
              id: program.id,
              nombre: program.nombre,
              codigo: program.codigo,
              activo: program.activo,
              members: program.docentes.map(({ docente }) => docente.usuario)
            }))}
            teachers={teachers}
            returnContext="usuarios"
            expandedProgramId={query.programa}
            createProgramAction={crearProgramaAdmin}
            updateProgramAction={actualizarProgramaAdmin}
            deleteProgramAction={eliminarProgramaAdmin}
            addAction={agregarIntegrantePrograma}
            inviteAction={invitarIntegrantePrograma}
            removeAction={quitarIntegrantePrograma}
          />
        </>
      )}
    </>
  );
}

function programStateMessage(state: string): string {
  const messages: Record<string, string> = {
    "programa-creado": "El programa fue creado.",
    "programa-actualizado": "Los datos del programa fueron actualizados.",
    "programa-eliminado": "El programa fue eliminado.",
    "integrante-agregado": "La persona fue agregada al programa.",
    "integrante-quitado": "La persona fue quitada del programa. Su usuario y su historial se conservaron.",
    "invitacion-enviada": "La persona fue creada, asociada al programa e invitada por correo.",
    "invitacion-creada": "La persona fue creada y asociada. El correo de invitación no pudo enviarse."
  };
  return messages[state] ?? "La operación fue completada.";
}

function isUserType(value: string | undefined): value is UserType {
  return USER_TYPES.some((type) => type.value === value);
}
