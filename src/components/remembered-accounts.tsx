"use client";

import { X } from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import { iniciarGoogleConSesionLimpia } from "@/src/lib/auth/google-login-browser-flow";
import { useEffect, useState } from "react";
import {
  olvidarCuenta,
  type CuentaRecordada
} from "@/src/modules/usuarios/cuentas-recordadas.domain";
import {
  readRememberedAccounts,
  writeRememberedAccounts
} from "@/src/lib/browser/remembered-accounts";

export function RememberedAccounts() {
  const [accounts, setAccounts] = useState<readonly CuentaRecordada[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => setAccounts(readRememberedAccounts()), []);

  function forget(accountId: string) {
    const updated = olvidarCuenta(accounts, accountId);
    writeRememberedAccounts(updated);
    setAccounts(updated);
  }

  async function iniciarRecordada(account: CuentaRecordada) {
    if (pending) return;
    setPending(account.id);
    setError(false);
    try {
      await iniciarGoogleConSesionLimpia(signOut, signIn, account.identificador);
    } catch {
      setPending(null);
      setError(true);
    }
  }

  if (accounts.length === 0) return null;

  return (
    <section className="remembered-accounts" aria-labelledby="remembered-title">
      <h2 id="remembered-title">Cuentas de este navegador</h2>
      {error ? <p role="alert" className="login-error">No se pudo iniciar el acceso con Google.</p> : null}
      <div>
        {accounts.map((account) => (
          <div className="remembered-account" key={account.id}>
            <div>
              <button className="remembered-account-button" type="button" disabled={pending !== null} onClick={() => void iniciarRecordada(account)}>
                <span className="avatar" aria-hidden="true">{account.nombre.slice(0, 1).toUpperCase()}</span>
                <span><strong>{account.nombre}</strong><small>{account.identificador}</small></span>
              </button>
            </div>
            <button
              aria-label={`Olvidar ${account.nombre}`}
              className="icon-button"
              onClick={() => forget(account.id)}
              title="Olvidar cuenta"
              type="button"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
