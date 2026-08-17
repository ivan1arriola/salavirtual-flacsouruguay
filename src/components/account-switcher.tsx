"use client";

import { Repeat2 } from "lucide-react";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  recordarCuenta,
  type CuentaRecordada
} from "@/src/modules/usuarios/cuentas-recordadas.domain";
import {
  readRememberedAccounts,
  writeRememberedAccounts
} from "@/src/lib/browser/remembered-accounts";

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
      className="profile-menu-action"
      disabled={pending}
      onClick={switchAccount}
      type="button"
    >
      <Repeat2 size={18} aria-hidden="true" />
      <span>{pending ? "Cambiando cuenta…" : "Cambiar cuenta"}</span>
    </button>
  );
}
