"use client";

import { Save, Search } from "lucide-react";
import { useState } from "react";

type ProgramOption = Readonly<{ id: string; name: string }>;

export function TeacherProgramsForm({
  programs,
  initialSelectedIds,
  saveAction,
  title = "Mis programas",
  targetUserId,
}: Readonly<{
  programs: readonly ProgramOption[];
  initialSelectedIds: readonly string[];
  saveAction: (formData: FormData) => Promise<void>;
  title?: string;
  targetUserId?: string;
}>) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(initialSelectedIds);
  const normalizedQuery = query.trim().toLocaleLowerCase("es");
  const visiblePrograms = programs.filter(({ name }) =>
    name.toLocaleLowerCase("es").includes(normalizedQuery),
  );

  function toggle(programId: string, checked: boolean) {
    setSelectedIds(
      checked ? [...selectedIds, programId] : selectedIds.filter((id) => id !== programId),
    );
  }

  return (
    <section className="content-section settings-wide">
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          <p>{selectedIds.length} programas seleccionados.</p>
        </div>
      </div>
      <form className="profile-form" action={saveAction}>
        {targetUserId ? <input type="hidden" name="usuarioId" value={targetUserId} /> : null}
        {selectedIds.map((id) => (
          <input key={id} type="hidden" name="programaIds" value={id} />
        ))}
        <label className="program-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Buscar programas</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar programa"
          />
        </label>
        <div className="program-options">
          {visiblePrograms.map((program) => (
            <label key={program.id}>
              <input
                type="checkbox"
                checked={selectedIds.includes(program.id)}
                onChange={(event) => toggle(program.id, event.target.checked)}
              />
              <span>{program.name}</span>
            </label>
          ))}
          {visiblePrograms.length === 0 ? (
            <p className="muted-text">No hay programas que coincidan.</p>
          ) : null}
        </div>
        <div className="form-actions">
          <span className="muted-text">Los cambios se aplican a futuras reuniones.</span>
          <button className="primary-action" type="submit">
            <Save size={17} />
            Guardar programas
          </button>
        </div>
      </form>
    </section>
  );
}
