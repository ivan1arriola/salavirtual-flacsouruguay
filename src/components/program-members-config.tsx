import { ChevronDown, MailPlus, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";

type Teacher = Readonly<{
  id: string;
  nombres: string;
  apellidos: string | null;
  emailPrincipal: string | null;
  activo: boolean;
}>;

type ProgramMember = Teacher;

type Program = Readonly<{
  id: string;
  nombre: string;
  codigo: string | null;
  activo: boolean;
  members: readonly ProgramMember[];
}>;

type ProgramAction = (formData: FormData) => Promise<void>;

export function ProgramMembersConfig({
  programs,
  teachers,
  expandedProgramId,
  addAction,
  inviteAction,
  removeAction
}: Readonly<{
  programs: readonly Program[];
  teachers: readonly Teacher[];
  expandedProgramId?: string;
  addAction: ProgramAction;
  inviteAction: ProgramAction;
  removeAction: ProgramAction;
}>) {
  return (
    <section className="content-section program-management">
      <div className="section-heading">
        <div>
          <h2>Programas</h2>
          <p>Consultá integrantes, agregá docentes existentes o invitá personas nuevas.</p>
        </div>
      </div>
      <div className="program-management-list">
        {programs.map((program) => {
          const memberIds = new Set(program.members.map(({ id }) => id));
          const availableTeachers = teachers.filter((teacher) => !memberIds.has(teacher.id));
          const sortedMembers = [...program.members].sort((left, right) =>
            `${left.apellidos ?? ""} ${left.nombres}`.localeCompare(
              `${right.apellidos ?? ""} ${right.nombres}`,
              "es"
            )
          );

          return (
            <details className="program-management-card" key={program.id} open={expandedProgramId === program.id}>
              <summary>
                <span className="program-management-name">
                  <strong>{program.nombre}</strong>
                  <small>{program.codigo ?? "Sin código"}</small>
                </span>
                <span className="program-management-summary-meta">
                  <span>{program.members.length} {program.members.length === 1 ? "docente" : "docentes"}</span>
                  <span className={`status status-${program.activo ? "ok" : "error"}`}>{program.activo ? "Activo" : "Inactivo"}</span>
                  <ChevronDown size={18} aria-hidden="true" />
                </span>
              </summary>

              <div className="program-management-body">
                <div className="table-wrap">
                  <table className="data-table program-member-table">
                    <thead><tr><th>Persona</th><th>Correo</th><th>Acceso</th><th>Acciones</th></tr></thead>
                    <tbody>
                      {sortedMembers.map((member) => (
                        <tr key={member.id}>
                          <td><strong>{member.nombres} {member.apellidos}</strong></td>
                          <td>{member.emailPrincipal ?? <span className="muted-text">Sin correo principal</span>}</td>
                          <td><span className={`status status-${member.activo ? "ok" : "error"}`}>{member.activo ? "Activo" : "Inactivo"}</span></td>
                          <td>
                            <div className="program-member-actions">
                              <Link className="secondary-action" href={`/usuarios/${encodeURIComponent(member.id)}`}>Gestionar</Link>
                              <form action={removeAction}>
                                <input name="programaId" type="hidden" value={program.id} />
                                <input name="usuarioId" type="hidden" value={member.id} />
                                <button className="secondary-action danger-action" type="submit"><UserMinus size={16} />Quitar</button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {sortedMembers.length === 0 ? <tr><td className="empty-table-cell" colSpan={4}>Este programa no tiene docentes asociados.</td></tr> : null}
                    </tbody>
                  </table>
                </div>

                {program.activo ? (
                  <div className="program-member-editors">
                    <form className="program-member-editor" action={addAction}>
                      <div>
                        <h3><UserPlus size={18} />Agregar una persona existente</h3>
                        <p>La cuenta y sus otras pertenencias no cambian.</p>
                      </div>
                      <input name="programaId" type="hidden" value={program.id} />
                      <label className="field">
                        <span>Docente</span>
                        <select name="usuarioId" defaultValue="" required>
                          <option value="" disabled>Seleccionar persona</option>
                          {availableTeachers.map((teacher) => (
                            <option key={teacher.id} value={teacher.id}>
                              {teacher.nombres} {teacher.apellidos ?? ""} · {teacher.emailPrincipal ?? teacher.id}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button className="primary-action" disabled={availableTeachers.length === 0} type="submit"><UserPlus size={16} />Agregar</button>
                    </form>

                    <form className="program-member-editor program-member-invite" action={inviteAction}>
                      <div className="program-member-editor-heading">
                        <h3><MailPlus size={18} />Invitar una persona nueva</h3>
                        <p>Se creará como docente y quedará asociada a este programa.</p>
                      </div>
                      <input name="programaId" type="hidden" value={program.id} />
                      <label className="field"><span>Nombre</span><input name="nombres" maxLength={100} required /></label>
                      <label className="field"><span>Apellido</span><input name="apellidos" maxLength={120} /></label>
                      <label className="field field-wide"><span>Correo</span><input name="email" type="email" required /></label>
                      <button className="primary-action" type="submit"><MailPlus size={16} />Crear e invitar</button>
                    </form>
                  </div>
                ) : <p className="program-inactive-help">El programa está inactivo. Podés consultar o quitar integrantes, pero no agregar nuevos.</p>}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
