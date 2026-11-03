/** El `start_url` de Zoom abre la reunión como anfitrión: solo para administración y el docente titular. */
export function puedeVerEnlaceAnfitrion(
  actor: Readonly<{ id: string; rol: string }>,
  docenteUsuarioId: string
): boolean {
  return actor.rol === "ADMINISTRACION" ||
    (actor.rol === "DOCENTE" && actor.id === docenteUsuarioId);
}
