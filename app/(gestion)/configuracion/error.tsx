"use client";

import Link from "next/link";

/** Si falla la carga de una pantalla de configuración (base, descifrado, etc.) no se pierde la navegación. */
export default function ConfiguracionError({
  error,
  retry
}: Readonly<{ error: Error & { digest?: string }; retry: () => void }>) {
  return (
    <div className="settings-center">
      <section className="content-section" role="alert">
        <h1>No se pudo cargar la configuración</h1>
        <p>
          Ocurrió un error al leer los datos. Probá de nuevo; si persiste, avisá a soporte
          {error.digest ? ` indicando el código ${error.digest}` : ""}.
        </p>
        <div className="form-actions">
          <button className="primary-action" type="button" onClick={() => retry()}>
            Reintentar
          </button>
          <Link className="secondary-action" href="/configuracion">
            Volver al resumen
          </Link>
        </div>
      </section>
    </div>
  );
}
