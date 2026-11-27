"use client";

import { useState } from "react";

type Registro = { correo: string; externo: boolean | null; conferenciaId: string };
export function MeetAttendanceEmails({
  meetings,
}: {
  meetings: readonly {
    id: string;
    descripcion: string | null;
    fechaLegible: string;
    temporalidad: string;
    codigoMeet: string | null;
  }[];
}) {
  const [selected, setSelected] = useState("");
  const [records, setRecords] = useState<Registro[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const past = meetings.filter((m) => m.temporalidad === "PASADO" && m.codigoMeet);
  async function synchronize(id: string) {
    setBusy(true);
    setSelected(id);
    setError("");
    setRecords([]);
    try {
      const response = await fetch(
        `/api/v1/reuniones/instancias/${encodeURIComponent(id)}/correos-asistencia`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Error de Google Workspace");
      }
      setRecords(data.correos ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar asistencia");
    } finally {
      setBusy(false);
    }
  }
  function exportCsv() {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const csv =
      "\uFEFF" +
      [
        "Correo,Externo,Conferencia",
        ...records.map((r) =>
          [r.correo, r.externo === null ? "" : r.externo ? "Sí" : "No", r.conferenciaId]
            .map(escape)
            .join(","),
        ),
      ].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `asistencia-correos-${selected}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!past.length) {
    return null;
  }
  return (
    <section aria-label="Correos de asistencia Meet" style={{ marginBlock: "1.5rem" }}>
      <h2>Correos de asistencia de Google Meet</h2>
      <p>
        Consultá los registros de Google Workspace por encuentro. Solo se muestran correos
        identificados por Google; no se infieren identidades por nombre.
      </p>
      <label htmlFor="meet-audit-meeting">Encuentro finalizado</label>{" "}
      <select
        id="meet-audit-meeting"
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value);
          setRecords([]);
          setError("");
        }}
      >
        <option value="">Elegí un encuentro</option>
        {past.map((m) => (
          <option key={m.id} value={m.id}>
            {m.fechaLegible} — {m.descripcion || m.codigoMeet}
          </option>
        ))}
      </select>{" "}
      <button
        type="button"
        className="secondary-action"
        disabled={!selected || busy}
        onClick={() => synchronize(selected)}
      >
        {busy ? "Consultando…" : "Sincronizar asistencia"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {!busy && selected && !error ? (
        <p>
          {records.length} correos recuperados de la última consulta. Un resultado vacío no
          demuestra ausencia.
        </p>
      ) : null}
      {records.length > 0 ? (
        <>
          <button type="button" className="secondary-action" onClick={exportCsv}>
            Exportar CSV compatible con Excel
          </button>
          <div style={{ overflowX: "auto", marginTop: "1rem" }}>
            <table>
              <thead>
                <tr>
                  <th>Correo</th>
                  <th>Externo</th>
                  <th>Conferencia de auditoría</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.conferenciaId + r.correo}>
                    <td>{r.correo}</td>
                    <td>{r.externo === null ? "No informado" : r.externo ? "Sí" : "No"}</td>
                    <td>{r.conferenciaId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
