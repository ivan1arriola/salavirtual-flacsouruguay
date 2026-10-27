import {
  actualizarSalaZoomAdmin,
  actualizarZoomAdmin,
  importarSalasZoomAdmin
} from "../../app/(gestion)/configuracion/actions";
import { ZOOM_SCOPES_OPCIONALES, ZOOM_SCOPES_REQUERIDOS } from "@/src/modules/configuracion/zoom.domain";

type ZoomConfig = Readonly<{
  accountId: string | null;
  clientId: string | null;
  secretoConfigurado: boolean;
  activa: boolean;
}>;

type ZoomRoom = Readonly<{
  id: string;
  nombre: string;
  emailOrganizador: string | null;
  prioridad: number;
  tieneLicencia: boolean;
  activa: boolean;
  enUso: boolean;
}>;

export function ZoomSettings({ config, salas }: Readonly<{ config: ZoomConfig; salas: readonly ZoomRoom[] }>) {
  const salasDisponibles = salas.filter(({ activa, tieneLicencia }) => activa && tieneLicencia).length;

  return (
    <>
      <section className="content-section email-test-section" aria-labelledby="zoom-credentials-title">
        <div className="section-heading">
          <div>
            <h2 id="zoom-credentials-title">App Server-to-Server OAuth</h2>
            <p>Creá la app en el Marketplace de Zoom con una cuenta administradora y copiá acá sus datos. El secreto se guarda cifrado.</p>
          </div>
        </div>
        <form action={actualizarZoomAdmin} className="email-test-form">
          <label className="field">
            <span>Account ID</span>
            <input autoComplete="off" name="accountId" defaultValue={config.accountId ?? ""} required />
          </label>
          <label className="field">
            <span>Client ID</span>
            <input autoComplete="off" name="clientId" defaultValue={config.clientId ?? ""} required />
          </label>
          <label className="field">
            <span>Client Secret {config.secretoConfigurado ? "(dejalo vacío para conservar el actual)" : ""}</span>
            <input autoComplete="off" name="clientSecret" type="password" required={!config.secretoConfigurado} />
          </label>
          <label className="checkbox-field">
            <input name="activa" type="checkbox" defaultChecked={config.activa} />
            <span>Permitir elegir Zoom al crear reuniones</span>
          </label>
          <details className="email-test-help">
            <summary>Scopes que necesita la app</summary>
            <ul>
              {ZOOM_SCOPES_REQUERIDOS.map((scope) => <li key={scope}><code>{scope}</code></li>)}
            </ul>
            <p>Opcional, para ver participantes en vivo en la consola (plan Business o superior):</p>
            <ul>
              {ZOOM_SCOPES_OPCIONALES.map((scope) => <li key={scope}><code>{scope}</code></li>)}
            </ul>
          </details>
          <button className="primary-action" type="submit">Guardar credenciales de Zoom</button>
        </form>
      </section>

      <section className="content-section" aria-labelledby="zoom-rooms-title">
        <div className="section-heading">
          <div>
            <h2 id="zoom-rooms-title">Salas Zoom</h2>
            <p>
              Cada sala es un usuario con licencia de la cuenta Zoom. Las salas importadas quedan inactivas
              hasta que las actives. {salasDisponibles} de {salas.length} disponibles.
            </p>
          </div>
          <form action={importarSalasZoomAdmin}>
            <button className="secondary-action" type="submit" disabled={!config.secretoConfigurado}>
              Probar conexión e importar salas
            </button>
          </form>
        </div>

        {salas.length === 0 ? (
          <p className="empty-state">Todavía no hay salas Zoom. Guardá las credenciales e importalas desde Zoom.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Usuario Zoom</th>
                  <th scope="col">Licencia</th>
                  <th scope="col">Prioridad</th>
                  <th scope="col">Activa</th>
                  <th scope="col"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {salas.map((sala) => {
                  const formId = `sala-zoom-${sala.id}`;
                  return (
                    <tr key={sala.id}>
                      <td>
                        <strong>{sala.emailOrganizador ?? sala.nombre}</strong>
                        {sala.enUso ? <small> · con reuniones</small> : null}
                      </td>
                      <td>{sala.tieneLicencia ? "Con licencia" : "Sin licencia"}</td>
                      <td>
                        <input
                          aria-label={`Prioridad de ${sala.emailOrganizador ?? sala.nombre}`}
                          style={{ width: "5.5rem" }}
                          defaultValue={sala.prioridad}
                          form={formId}
                          max={1000}
                          min={1}
                          name="prioridad"
                          type="number"
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Sala activa ${sala.emailOrganizador ?? sala.nombre}`}
                          defaultChecked={sala.activa}
                          disabled={!sala.tieneLicencia}
                          form={formId}
                          name="activa"
                          type="checkbox"
                        />
                      </td>
                      <td>
                        <form action={actualizarSalaZoomAdmin} id={formId}>
                          <input name="id" type="hidden" value={sala.id} />
                          <button className="secondary-action" type="submit">Guardar</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
