"use client";

import {
  normalizarCuentasRecordadas,
  type CuentaRecordada
} from "@/src/modules/usuarios/cuentas-recordadas.domain";

const REMEMBERED_ACCOUNTS_KEY = "flacso-meet-cuentas-recordadas";
const LEGACY_REMEMBERED_ACCOUNTS_KEY = "gestor-flacso-cuentas-recordadas";

export function readRememberedAccounts(): readonly CuentaRecordada[] {
  try {
    const stored =
      localStorage.getItem(REMEMBERED_ACCOUNTS_KEY) ??
      localStorage.getItem(LEGACY_REMEMBERED_ACCOUNTS_KEY) ??
      "[]";
    const accounts = normalizarCuentasRecordadas(JSON.parse(stored));
    if (!localStorage.getItem(REMEMBERED_ACCOUNTS_KEY) && accounts.length > 0) {
      localStorage.setItem(REMEMBERED_ACCOUNTS_KEY, JSON.stringify(accounts));
    }
    return accounts;
  } catch {
    return [];
  }
}

export function writeRememberedAccounts(accounts: readonly CuentaRecordada[]): void {
  try {
    localStorage.setItem(REMEMBERED_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // El cambio de sesión sigue funcionando si el navegador bloquea almacenamiento local.
  }
}
