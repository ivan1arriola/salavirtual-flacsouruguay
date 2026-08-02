export type DependenciasPasswordInicial = Readonly<{
  cifrar: (value: string) => string;
  descifrar: (value: string) => string;
}>;

export function guardarPasswordInicialCifrada(
  passwordTemporal: string,
  dependencias: Pick<DependenciasPasswordInicial, "cifrar">
): string {
  return dependencias.cifrar(passwordTemporal);
}

export function leerPasswordInicialCifrada(
  passwordInicialCifrada: string | null,
  dependencias: Pick<DependenciasPasswordInicial, "descifrar">
): string | null {
  return passwordInicialCifrada ? dependencias.descifrar(passwordInicialCifrada) : null;
}
