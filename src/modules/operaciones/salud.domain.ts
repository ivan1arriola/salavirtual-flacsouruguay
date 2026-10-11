export type OperationalHealth = Readonly<{
  status: "ok" | "degradado" | "critico";
  pendingGoogle: number;
  googleErrors: number;
  staleClaims: number;
  oldestPendingMinutes: number | null;
}>;

/**
 * A pending event younger than 30 minutes is normal eventual consistency.
 * Long waits and abandoned worker claims are operational incidents.
 */
export function evaluarSaludOperativa(input: Omit<OperationalHealth, "status">): OperationalHealth {
  const { pendingGoogle, googleErrors, staleClaims, oldestPendingMinutes } = input;
  const status = staleClaims > 0 || (oldestPendingMinutes ?? 0) >= 120
    ? "critico"
    : googleErrors > 0 || (oldestPendingMinutes ?? 0) >= 30
      ? "degradado"
      : "ok";
  return { ...input, status };
}
