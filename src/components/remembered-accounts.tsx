"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  olvidarCuenta,
  type CuentaRecordada
} from "@/src/modules/usuarios/cuentas-recordadas.domain";
import {
  readRememberedAccounts,
  writeRememberedAccounts
} from "./account-switcher";

export function RememberedAccounts() {
  const [accounts, setAccounts] = useState<readonly CuentaRecordada[]>([]);

  useEffect(() => setAccounts(readRememberedAccounts()), []);

  function forget(accountId: string) {
    const updated = olvidarCuenta(accounts, accountId);
    writeRememberedAccounts(updated);
    setAccounts(updated);
  }

  if (accounts.length === 0) return null;

  return (
    <section className="remembered-accounts" aria-labelledby="remembered-title">
      <h2 id="remembered-title">Cuentas de este navegador</h2>
      <div>
        {accounts.map((account) => (
          <div className="remembered-account" key={account.id}>
            <a href={`/acceso?usuario=${encodeURIComponent(account.identificador)}`}>
              <span className="avatar" aria-hidden="true">{account.nombre.slice(0, 1).toUpperCase()}</span>
              <span><strong>{account.nombre}</strong><small>{account.identificador}</small></span>
            </a>
            <button className="icon-button" onClick={() => forget(account.id)} title="Olvidar cuenta" type="button">
              <X size={16} aria-hidden="true" />
              <span className="sr-only">Olvidar {account.nombre}</span>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
