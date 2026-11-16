import { rutaCalendarioZoom } from "@/src/bootstrap/calendario-zoom-asistente.server";

const mensajes = new Map([
  ["conectado", "Cuenta conectada. Tus coberturas aparecerán durante la próxima sincronización."],
  ["sincronizado", "Tu calendario se actualizó."],
  ["desconectado", "Google Calendar se desconectó."],
  ["desconectado-revocado", "Cuenta desconectada. Si el calendario sigue en Google, podés eliminarlo allí."],
  ["sin-permiso", "La conexión se canceló. Podés iniciarla otra vez."],
  ["ocupado", "Tu calendario se está actualizando. Probá de nuevo en unos segundos."],
  ["error", "No se pudo completar la operación con Google Calendar. Probá de nuevo."]
]);

export function CalendarioZoomAsistente({
  conexion,
  estado
}: Readonly<{
  conexion: { email: string; ultimoIntentoAt: Date | null; error: string | null } | null;
  estado: string | undefined;
}>) {
  const mensaje = estado ? mensajes.get(estado) : undefined;

  return (
    <section className="content-section" aria-labelledby="calendario-zoom-titulo">
      <div className="section-heading">
        <div>
          <h2 id="calendario-zoom-titulo">Google Calendar</h2>
          <p>
            {conexion
              ? `Cuenta conectada: ${conexion.email}`
              : "Sincronizá tus próximas coberturas de Zoom en un calendario de Sala Virtual."}
          </p>
        </div>
      </div>
      {mensaje ? <p role="status">{mensaje}</p> : null}
      {conexion?.error === "reconectar" ? (
        <p role="status">Google retiró el permiso. Desconectá la cuenta y volvé a conectarla.</p>
      ) : null}
      {conexion?.error === "error" ? (
        <p role="status">La sincronización quedó pendiente. Sala Virtual volverá a intentarlo.</p>
      ) : null}
      {conexion && !conexion.error && !conexion.ultimoIntentoAt ? (
        <p role="status">Primera sincronización pendiente.</p>
      ) : null}
      <form action={rutaCalendarioZoom} method="post" className="assistant-agenda-primary-actions">
        {conexion ? (
          <>
            {conexion.error !== "reconectar" ? (
              <button className="secondary-action" name="accion" value="sincronizar" type="submit">
                Sincronizar ahora
              </button>
            ) : null}
            <button className="secondary-action" name="accion" value="desconectar" type="submit">
              Desconectar Google Calendar
            </button>
          </>
        ) : (
          <button className="secondary-action" name="accion" value="conectar" type="submit">
            Conectar Google Calendar
          </button>
        )}
      </form>
      {conexion ? <p>Al desconectar se elimina el calendario creado por Sala Virtual.</p> : null}
    </section>
  );
}
