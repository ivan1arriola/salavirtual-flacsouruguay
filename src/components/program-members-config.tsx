import { ChevronDown, MailPlus, Pencil, Plus, Save, Trash2, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";

type Teacher = Readonly<{
  id: string;
  nombres: string;
  apellidos: string | null;
  emailPrincipal: string | null;
  activo: boolean;
}>;

type AcademicUnit = Readonly<{
  id: string;
  nombre: string;
  activa: boolean;
}>;

type ProgramMember = Teacher;

type Program = Readonly<{
  id: string;
  nombre: string;
  codigo: string | null;
  activo: boolean;
  unidadAcademicaId: string | null;
  unidadAcademica: AcademicUnit | null;
  members: readonly ProgramMember[];
}>;

type ProgramAction = (formData: FormData) => Promise<void>;

export function ProgramMembersConfig({
  programs,
  academicUnits,
  teachers,
  expandedProgramId,
  createProgramAction,
  updateProgramAction,
  deleteProgramAction,
  addAction,
  inviteAction,
  removeAction
}: Readonly<{
  programs: readonly Program[];
  academicUnits: readonly AcademicUnit[];
  teachers: readonly Teacher[];
  expandedProgramId?: string;
  createProgramAction: ProgramAction;
  updateProgramAction: ProgramAction;
  deleteProgramAction: ProgramAction;
  addAction: ProgramAction;
  inviteAction: ProgramAction;
  removeAction: ProgramAction;
}>) {
  return (
    <section className="content-section program-management">
      <div className="section-heading program-management-heading">
        <div>
          <h2>Programas</h2>
          <p>Creá, editá, desactivá o eliminá programas y administrá sus docentes.</p>
        </div>
        <details className="program-create-panel">
          <summary className="primary-action"><Plus size={17} />Nuevo programa</summary>
          <form className="program-definition-form program-create-form" action={createProgramAction}>
            <div className="program-definition-heading">
              <div><strong>Crear programa</strong><small>Quedará disponible inmediatamente para asociaciones y reuniones si está activo.</small></div>
            </div>
            <label className="field field-wide"><span>Nombre</span><input name="nombre" maxLength={180} minLength={2} required placeholder="Ej. Maestría en Educación" /></label>
            <label className="field"><span>Código (opcional)</span><input name="codigo" maxLength={60} placeholder="Ej. ME-2026" /></label>
            <label className="field">
              <span>Unidad académica (opcional)</span>
              <select name="unidadAcademicaId" defaultValue="">
                <option value="">Sin unidad académica</option>
                {academicUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.nombre}{unit.activa ? "" : " · inactiva"}</option>
                ))}
              </select>
            </label>
            <label className="program-active-toggle field-wide"><input name="activo" type="checkbox" defaultChecked /><span><strong>Programa activo</strong><small>Puede asignarse a docentes y utilizarse al crear reuniones.</small></span></label>
            <div className="program-definition-actions"><button className="primary-action" type="submit"><Plus size={16} />Crear programa</button></div>
          </form>
        </details>
      </div>

      {programs.length === 0 ? (
        <div className="program-empty-state"><strong>No hay programas creados.</strong><span>Usá “Nuevo programa” para registrar el primero.</span></div>
      ) : null}

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
                  <small>
                    {program.codigo ?? "Sin código"}
                    {program.unidadAcademica ? ` · ${program.unidadAcademica.nombre}` : " · Sin unidad académica"}
                  </small>
                </span>
                <span className="program-management-summary-meta">
                  <span>{program.members.length} {program.members.length === 1 ? "docente" : "docentes"}</span>
                  <span className={`status status-${program.activo ? "ok" : "error"}`}>{program.activo ? "Activo" : "Inactivo"}</span>
                  <ChevronDown size={18} aria-hidden="true" />
                </span>
              </summary>

              <div className="program-management-body">
                <section className="program-definition-editor">
                  <div className="program-subsection-heading">
                    <div><h3><Pencil size={17} />Datos del programa</h3><p>Editá nombre, código, unidad académica y disponibilidad.</p></div>
                  </div>
                  <form className="program-definition-form" action={updateProgramAction}>
                    <input name="programaId" type="hidden" value={program.id} />
                    <label className="field field-wide"><span>Nombre</span><input name="nombre" maxLength={180} minLength={2} required defaultValue={program.nombre} /></label>
                    <label className="field"><span>Código (opcional)</span><input name="codigo" maxLength={60} defaultValue={program.codigo ?? ""} /></label>
                    <label className="field">
                      <span>Unidad académica (opcional)</span>
                      <select name="unidadAcademicaId" defaultValue={program.unidadAcademicaId ?? ""}>
                        <option value="">Sin unidad académica</option>
                        {academicUnits.map((unit) => (
                          <option key={unit.id} value={unit.id}>{unit.nombre}{unit.activa ? "" : " · inactiva"}</option>
                        ))}
                      </select>
                    </label>
                    <label className="program-active-toggle field-wide"><input name="activo" type="checkbox" defaultChecked={program.activo} /><span><strong>Programa activo</strong><small>Los programas inactivos se conservan para consulta, pero no aceptan nuevas asociaciones.</small></span></label>
                    <div className="program-definition-actions"><button className="primary-action" type="submit"><Save size={16} />Guardar cambios</button></div>
                  </form>

                  <details className="program-delete-panel">
                    <summary><Trash2 size={16} />Eliminar programa</summary>
                    <div className="program-delete-body">
                      <div>
                        <strong>Eliminación permanente</strong>
                        <p>Solo se eliminará si no tiene reuniones históricas. Si las tiene, debés marcarlo como inactivo para conservar el historial.</p>
                      </div>
                      <form action={deleteProgramAction}>
                        <input name="programaId" type="hidden" value={program.id} />
                        <label className="field"><span>Escribí ELIMINAR para confirmar</span><input name="confirmacion" pattern="ELIMINAR" required autoComplete="off" /></label>
                        <button className="secondary-action danger-action" type="submit"><Trash2 size={16} />Eliminar definitivamente</button>
                      </form>
                    </div>
                  </details>
                </section>

                <section className="program-members-section">
                  <div className="program-subsection-heading">
                    <div><h3>Docentes asociados</h3><p>Estas personas pueden crear y administrar reuniones del programa.</p></div>
                  </div>
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
                </section>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
