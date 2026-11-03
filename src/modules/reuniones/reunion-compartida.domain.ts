/**
 * La creación de una reunión Zoom compartida por serie está detrás de la bandera
 * `ZOOM_REUNION_COMPARTIDA` (apagada por defecto). Se enciende solo después de desplegar y
 * sin versiones anteriores del worker en ejecución: una versión vieja no debe procesar un
 * `CANCELAR` sobre un evento con reunión compartida.
 */
export function reunionCompartidaHabilitada(
  env: Readonly<Record<string, string | undefined>>
): boolean {
  const valor = env.ZOOM_REUNION_COMPARTIDA;
  return valor === "1" || valor === "true";
}
