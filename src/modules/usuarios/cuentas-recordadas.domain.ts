export type CuentaRecordada = Readonly<{
  id: string;
  nombre: string;
  identificador: string;
}>;

export function esCuentaRecordada(value: unknown): value is CuentaRecordada {
  if (typeof value !== "object" || value === null) return false;
  const account = value as Record<string, unknown>;
  return [account.id, account.nombre, account.identificador].every(
    (field) => typeof field === "string" && field.length > 0
  );
}

export function normalizarCuentasRecordadas(value: unknown): readonly CuentaRecordada[] {
  return Array.isArray(value) ? value.filter(esCuentaRecordada).slice(0, 5) : [];
}

export function recordarCuenta(
  accounts: readonly CuentaRecordada[],
  account: CuentaRecordada
): readonly CuentaRecordada[] {
  const remaining = accounts.filter(
    ({ id, identificador }) => id !== account.id && identificador !== account.identificador
  );
  return [account, ...remaining].slice(0, 5);
}

export function olvidarCuenta(
  accounts: readonly CuentaRecordada[],
  accountId: string
): readonly CuentaRecordada[] {
  return accounts.filter(({ id }) => id !== accountId);
}
