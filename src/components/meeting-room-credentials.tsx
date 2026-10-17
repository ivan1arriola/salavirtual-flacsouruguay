"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { useMemo, useState } from "react";

type RoomCredential = Readonly<{
  cuenta: string;
  contrasena: string;
  ordinal: number;
}>;

type GroupedRoomCredential = Readonly<{
  cuenta: string;
  contrasena: string;
  encuentros: readonly number[];
}>;

export function MeetingRoomCredentials({
  credentials
}: Readonly<{ credentials: readonly RoomCredential[] }>) {
  const [copied, setCopied] = useState<string | null>(null);
  const rooms = useMemo(() => groupCredentials(credentials), [credentials]);

  if (rooms.length === 0) return null;

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => current === key ? null : current), 1800);
    } catch {
      setCopied(null);
    }
  }

  return (
    <section className="content-section meeting-room-credentials" aria-labelledby="room-credentials-title">
      <div className="section-heading">
        <div>
          <h2 id="room-credentials-title">Credenciales de sala</h2>
          <p>Usá estas credenciales para iniciar sesión con la cuenta que administra Google Meet.</p>
          <h2 id="room-credentials-title">Credenciales de sala (Administración)</h2>
          <p>Credenciales de contingencia. Los anfitriones y asistentes de monitoreo ingresan directamente con su cuenta Google institucional como co-organizadores sin necesidad de estas contraseñas.</p>
        </div>
      </div>

      <div className="encounter-list">
        {rooms.map((room) => (
          <article className="encounter-item encounter-card" key={room.cuenta}>
            <header>
              <span className="encounter-title">
                <strong>{room.cuenta}</strong>
                <small className="encounter-date-summary">
                  {room.encuentros.length === 1
                    ? `Encuentro ${room.encuentros[0]}`
                    : `Encuentros ${room.encuentros.join(", ")}`}
                </small>
              </span>
              <span className="status status-ok">Sala asignada</span>
            </header>

            <div className="encounter-read-body" style={{ gridTemplateColumns: "1fr" }}>
              <dl className="encounter-facts">
                <div>
                  <dt>Usuario</dt>
                  <dd><code>{room.cuenta}</code></dd>
                </div>
                <div>
                  <dt>Contraseña</dt>
                  <dd><code>{room.contrasena}</code></dd>
                </div>
                <div>
                  <dt>Uso</dt>
                  <dd>Inicio de sesión en Google</dd>
                </div>
              </dl>
            </div>

            <footer className="encounter-card-actions">
              <div className="encounter-card-primary-actions">
                <button
                  className="secondary-action"
                  onClick={() => copy(room.cuenta, `${room.cuenta}:usuario`)}
                  type="button"
                >
                  {copied === `${room.cuenta}:usuario` ? <Check size={16} /> : <Copy size={16} />}
                  {copied === `${room.cuenta}:usuario` ? "Usuario copiado" : "Copiar usuario"}
                </button>
                <button
                  className="secondary-action"
                  onClick={() => copy(room.contrasena, `${room.cuenta}:contrasena`)}
                  type="button"
                >
                  {copied === `${room.cuenta}:contrasena` ? <Check size={16} /> : <KeyRound size={16} />}
                  {copied === `${room.cuenta}:contrasena` ? "Contraseña copiada" : "Copiar contraseña"}
                </button>
              </div>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}

function groupCredentials(credentials: readonly RoomCredential[]): GroupedRoomCredential[] {
  const grouped = new Map<string, { cuenta: string; contrasena: string; encuentros: number[] }>();

  for (const credential of credentials) {
    const current = grouped.get(credential.cuenta);
    if (current) {
      if (!current.encuentros.includes(credential.ordinal)) current.encuentros.push(credential.ordinal);
      continue;
    }
    grouped.set(credential.cuenta, {
      cuenta: credential.cuenta,
      contrasena: credential.contrasena,
      encuentros: [credential.ordinal]
    });
  }

  return Array.from(grouped.values());
}
