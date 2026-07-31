"use client";

import {
  normalizarCuentasRecordadas,
  type CuentaRecordada
} from "@/src/modules/usuarios/cuentas-recordadas.domain";

const REMEMBERED_ACCOUNTS_KEY = "gestor-flacso-cuentas-recordadas";

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
    // El cambio de sesión sigue funcionando si el navegador bloquea almacenamiento local.
  }
}
