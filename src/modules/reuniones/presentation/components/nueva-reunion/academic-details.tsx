import { BookOpen } from "lucide-react";
import { Field, FormSection } from "./form-primitives";
import type { ProgramOption } from "./tipos";

export function AcademicDetails({ programs, selectedProgramId, onProgramChange, title, onTitleChange }: Readonly<{
  programs: readonly ProgramOption[];
  selectedProgramId: string;
  onProgramChange: (id: string) => void;
  title: string;
  onTitleChange: (value: string) => void;
}>) {
  return (
      <FormSection id="datos-academicos" icon={<BookOpen size={19} />} number="1" title="Datos académicos" detail="Identificá la reunión y vinculala al programa correspondiente.">
        <div className="form-grid">
          <Field label="Título"><input name="titulo" value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder="Ej. Seminario de metodología" required minLength={3} autoComplete="off" /></Field>
          <Field label="Programa y docente">
            <select name="docenteProgramaId" required value={selectedProgramId} onChange={(event) => onProgramChange(event.target.value)}>
              <option value="" disabled>Seleccionar</option>
              {programs.map((option) => <option value={option.id} key={option.id}>{option.label} — {option.teacher}</option>)}
            </select>
          </Field>
          <Field label="Descripción general (opcional)" wide><textarea name="descripcion" placeholder="Contexto común a toda la serie" rows={3} /></Field>
        </div>
      </FormSection>
  );
}
