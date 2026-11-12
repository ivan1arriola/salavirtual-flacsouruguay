"use client";

import { History, Search } from "lucide-react";
import { useState } from "react";
import { filterHistoricalMeetings } from "./historical-meetings.domain";

export type HistoricalMeetingVisible = Readonly<{
  id: string;
  date: string;
  title: string;
  teacher: string;
  program: string;
  account: string;
  code: string;
}>;

export function HistoricalMeetingsTable({
  meetings
}: Readonly<{ meetings: readonly HistoricalMeetingVisible[] }>) {
  const [query, setQuery] = useState("");
  const filteredMeetings = filterHistoricalMeetings(meetings, query);

  return (
    <section className="content-section settings-history">
      <div className="settings-history__toolbar">
        <label className="settings-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Buscar reuniones históricas</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por reunión, programa o cuenta"
          />
        </label>
        <span>
          {filteredMeetings.length} de {meetings.length} registros
        </span>
      </div>

      {filteredMeetings.length === 0 ? (
        <div className="settings-empty-search">
          <Search size={22} />
          <strong>No encontramos reuniones</strong>
          <span>Probá con otro título, programa o cuenta.</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table settings-history-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Reunión</th>
                <th>Programa</th>
                <th>Cuenta</th>
                <th>Código Zoom</th>
              </tr>
            </thead>
            <tbody>
              {filteredMeetings.map((meeting) => (
                <tr key={meeting.id}>
                  <td className="date-cell" data-label="Fecha">
                    {meeting.date}
                  </td>
                  <td data-label="Reunión">
                    <strong>{meeting.title}</strong>
                    <small>{meeting.teacher}</small>
                  </td>
                  <td data-label="Programa">{meeting.program}</td>
                  <td data-label="Cuenta">{meeting.account}</td>
                  <td data-label="Código Zoom">{meeting.code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <footer className="settings-history__note">
        <History size={16} />
        Esta sección es de consulta. No modifica reuniones ni cuentas.
      </footer>
    </section>
  );
}
