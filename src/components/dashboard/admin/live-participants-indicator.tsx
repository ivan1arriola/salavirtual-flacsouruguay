"use client";

import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import styles from "./live-participants-indicator.module.css";

type ParticipanteActivo = Readonly<{
  nombre: string;
  user?: string;
  tipo: "CUENTA_GOOGLE" | "ANONIMO" | "TELEFONO";
}>;

type LiveParticipantsResponse =
  | Readonly<{
      estado: "OK";
      conferenciaExiste: boolean;
      conferenceName?: string;
      participantes: readonly ParticipanteActivo[];
      actualizadoAt: string;
    }>
  | Readonly<{
      estado: "NO_DISPONIBLE";
      motivo: "SIN_MEET" | "SIN_ORGANIZADOR" | "SIN_CREDENCIALES";
      participantes: readonly [];
      actualizadoAt: string;
    }>;

export function LiveParticipantsIndicator({
  instanciaId
}: Readonly<{
  instanciaId: string;
}>) {
  const [data, setData] = useState<LiveParticipantsResponse | null>(null);
  const [falloActualizacion, setFalloActualizacion] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let consultaEnCurso = false;

    const actualizar = async () => {
      if (consultaEnCurso) return;
      consultaEnCurso = true;
      try {
        const response = await fetch(
          `/api/v1/reuniones/instancias/${encodeURIComponent(instanciaId)}/participantes-activos`,
          {
            cache: "no-store",
            signal: controller.signal
          }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const nextData = (await response.json()) as LiveParticipantsResponse;
        setData(nextData);
        setFalloActualizacion(false);
      } catch {
        if (!controller.signal.aborted) {
          setFalloActualizacion(true);
        }
      } finally {
        consultaEnCurso = false;
      }
    };

    void actualizar();
    const intervalId = window.setInterval(() => void actualizar(), 15_000);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [instanciaId]);

  if (!data) {
    return (
      <span
        className={`${styles.summary} ${falloActualizacion ? styles.error : styles.loading}`}
        title={falloActualizacion ? "No se pudo consultar Google Meet." : "Consultando Google Meet…"}
      >
        <Users size={13} />
        {falloActualizacion ? "Sin datos en vivo" : "Consultando…"}
      </span>
    );
  }

  if (data.estado === "NO_DISPONIBLE") {
    return (
      <span
        className={`${styles.summary} ${styles.muted}`}
        title="La reunión no dispone de datos de presencia en Meet."
      >
        <Users size={13} />
        Sin datos en vivo
      </span>
    );
  }

  if (!data.conferenciaExiste) {
    return (
      <span
        className={`${styles.summary} ${styles.muted}`}
        title="Meet todavía no informó una conferencia activa."
      >
        <Users size={13} />
        Esperando Meet
      </span>
    );
  }

  const total = data.participantes.length;
  if (total === 0) {
    return (
      <span
        className={styles.summary}
        title={falloActualizacion ? "Mostrando el último dato disponible." : "Se actualiza cada 15 segundos."}
        aria-live="polite"
      >
        <Users size={13} />
        Sala vacía
      </span>
    );
  }

  return (
    <details
      className={`${styles.root} ${falloActualizacion ? styles.stale : ""}`}
      title={falloActualizacion ? "Mostrando el último dato disponible." : "Se actualiza cada 15 segundos."}
    >
      <summary aria-live="polite">
        <Users size={13} />
        <strong>{total}</strong> {total === 1 ? "conectado" : "conectados"}
      </summary>
      <div className={styles.panel}>
        <strong className={styles.heading}>En la reunión ahora</strong>
        <ul>
          {data.participantes.map((participante, index) => (
            <li key={participante.user ?? `${participante.tipo}-${participante.nombre}-${index}`}>
              <span className={styles.dot} aria-hidden="true" />
              <span className={styles.name}>{participante.nombre}</span>
              <small>{etiquetaTipo(participante.tipo)}</small>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function etiquetaTipo(tipo: ParticipanteActivo["tipo"]): string {
  if (tipo === "CUENTA_GOOGLE") return "Google";
  if (tipo === "TELEFONO") return "Teléfono";
  return "Invitado";
}
