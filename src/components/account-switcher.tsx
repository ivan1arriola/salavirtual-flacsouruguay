"use client";

import { Repeat2 } from "lucide-react";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  normalizarCuentasRecordadas,
  recordarCuenta,
  type CuentaRecordada
} from "@/src/modules/usuarios/cuentas-recordadas.domain";

export const REMEMBERED_ACCOUNTS_KEY = "gestor-flacso-cuentas-recordadas";

export function readRememberedAccounts(): readonly CuentaRecordada[] {
  try {
    return normalizarCuentasRecordadas(
      JSON.parse(localStorage.getItem(REMEMBERED_ACCOUNTS_KEY) ?? "[]")
    );
  } catch {
    return [];
  }
}

export function writeRememberedAccounts(accounts: readonly CuentaRecordada[]): void {
  try {
    localStorage.setItem(REMEMBERED_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // El cambio de sesión sigue funcionando aunque el navegador bloquee almacenamiento local.
  }
}

export function AccountSwitcher({ account }: Readonly<{ account: CuentaRecordada }>) {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    writeRememberedAccounts(recordarCuenta(readRememberedAccounts(), account));
  }, [account]);

  async function switchAccount() {
    setPending(true);
    writeRememberedAccounts(recordarCuenta(readRememberedAccounts(), account));
    await signOut({ redirectTo: "/acceso?cambiar=1" });
  }

  return (
    <button
      className="icon-button"
      disabled={pending}
      onClick={switchAccount}
      title="Cambiar cuenta"
      type="button"
    >
      <Repeat2 size={18} aria-hidden="true" />
      <span className="sr-only">Cambiar cuenta</span>
    </button>
  );
}
