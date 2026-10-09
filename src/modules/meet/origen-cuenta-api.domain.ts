export function fueCreadoConCuentaApiAnterior(
  creadoAt: Date,
  cambioCredencialAt: Date | null
): boolean {
  return Boolean(cambioCredencialAt && creadoAt.getTime() < cambioCredencialAt.getTime());
}
