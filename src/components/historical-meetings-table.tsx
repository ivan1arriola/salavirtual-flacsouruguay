import { History, Search } from "lucide-react";
import Link from "next/link";

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
  meetings,
  busqueda,
  pagina,
  totalPaginas,
  total
}: Readonly<{
  meetings: readonly HistoricalMeetingVisible[];
  busqueda: string;
  pagina: number;
  totalPaginas: number;
  total: number;
}>) {
  function enlacePagina(destino: number) {
    const params = new URLSearchParams({ pagina: String(destino) });
    if (busqueda) {
      params.set("busqueda", busqueda);
    }
    return `/configuracion/historico?${params.toString()}`;
  }

  return (
    <section className="content-section settings-history">
      <form action="/configuracion/historico" className="settings-history__toolbar" method="get">
        <label className="settings-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Buscar reuniones Zoom importadas</span>
          <input
            type="search"
            name="busqueda"
            defaultValue={busqueda}
            maxLength={120}
            placeholder="Buscar por reunión, programa o cuenta"
          />
        </label>
        <button type="submit" className="secondary-action">
          Buscar
        </button>
        {busqueda ? <Link href="/configuracion/historico">Limpiar búsqueda</Link> : null}
        <span>
          {total} {total === 1 ? "registro" : "registros"}
        </span>
      </form>

      {meetings.length === 0 ? (
        <div className="settings-empty-search">
          <Search size={22} />
          <strong>
            {busqueda ? "No encontramos reuniones" : "Todavía no hay registros Zoom importados."}
          </strong>
          {busqueda ? <span>Probá con otro título, programa o cuenta.</span> : null}
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
              {meetings.map((meeting) => (
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
      {totalPaginas > 1 ? (
        <nav className="settings-history__pagination" aria-label="Páginas de registros Zoom">
          {pagina > 1 ? <Link href={enlacePagina(pagina - 1)}>Anterior</Link> : <span>Anterior</span>}
          <span>
            Página {pagina} de {totalPaginas}
          </span>
          {pagina < totalPaginas ? (
            <Link href={enlacePagina(pagina + 1)}>Siguiente</Link>
          ) : (
            <span>Siguiente</span>
          )}
        </nav>
      ) : null}
      <footer className="settings-history__note">
        <History size={16} />
        Esta sección es de consulta. No modifica reuniones ni cuentas.
      </footer>
    </section>
  );
}
