"use client";

import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function OperationalIncidentForm({ instanciaId }: Readonly<{ instanciaId: string }>) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/v1/reuniones/instancias/${encodeURIComponent(instanciaId)}/incidencias`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: formData.get("tipo"),
            severidad: formData.get("severidad"),
            descripcion: formData.get("descripcion")
          })
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error ?? "No se pudo registrar la incidencia.");
        return;
      }
      setMessage("Incidencia registrada.");
      router.refresh();
    } catch {
      setMessage("No se pudo conectar con el servidor.");
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="content-section">
      <summary>
        <AlertTriangle size={17} aria-hidden="true" />
        <strong>Registrar incidencia</strong>
      </summary>
      <form action={submit} className="encounter-edit-form">
        <label className="field">
          <span>Tipo</span>
          <select defaultValue="OTRA" name="tipo" disabled={pending}>
            <option value="DOCENTE_NO_INGRESA">Docente no ingresa</option>
            <option value="AUDIO_VIDEO">Audio o video</option>
            <option value="GRABACION">Grabación</option>
            <option value="SALA_INCORRECTA">Sala incorrecta</option>
            <option value="CONECTIVIDAD">Conectividad</option>
            <option value="OTRA">Otra</option>
          </select>
        </label>
        <label className="field">
          <span>Severidad</span>
          <select defaultValue="MEDIA" name="severidad" disabled={pending}>
            <option value="BAJA">Baja</option>
            <option value="MEDIA">Media</option>
            <option value="ALTA">Alta</option>
            <option value="CRITICA">Crítica</option>
          </select>
        </label>
        <label className="field encounter-description-field">
          <span>Descripción</span>
          <textarea
            name="descripcion"
            minLength={3}
            maxLength={1000}
            rows={3}
            required
            disabled={pending}
            placeholder="Qué ocurrió y qué acción se tomó o se necesita."
          />
        </label>
        <button className="primary-action" type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="button-spinner" size={16} /> : <AlertTriangle size={16} />}
          {pending ? "Registrando…" : "Registrar incidencia"}
        </button>
        {message ? <p aria-live="polite">{message}</p> : null}
      </form>
    </details>
  );
}
