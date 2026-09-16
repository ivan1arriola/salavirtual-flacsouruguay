export type ReunionOperativaAccessInput = Readonly<{
  rol: "ASISTENTE_TECNICO" | "ADMINISTRACION";
  asignado: boolean;
}>;

export function puedeConsultarReunionOperativa(input: ReunionOperativaAccessInput): boolean {
  return input.rol === "ADMINISTRACION" || input.asignado;
}
