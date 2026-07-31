const metrics = [
  { label: "Solicitudes abiertas", value: "0" },
  { label: "Instancias esta semana", value: "0" },
  { label: "Asistencias pendientes", value: "0" },
  { label: "Zoom historico", value: "solo consulta" }
] as const;

const workflows = [
  "Crear solicitud Meet",
  "Asignar asistencia",
  "Revisar agenda",
  "Consultar historico Zoom"
] as const;

export default function HomePage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">FLACSO Uruguay</p>
          <h1>Gestor Google Meet</h1>
        </div>
        <nav className="actions" aria-label="Acciones principales">
          <a href="#solicitudes">Solicitudes</a>
          <a href="#agenda">Agenda</a>
          <a href="#historico">Historico</a>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/acceso" });
            }}
          >
            <button className="secondary-button" type="submit">
              Salir
            </button>
          </form>
        </nav>
      </header>

      <section className="panel intro" aria-labelledby="inicio-title">
        <div>
          <h2 id="inicio-title">Operacion academica, sin peso extra.</h2>
          <p>
            Base nueva para provisionar reuniones en Google Meet, coordinar asistencia y
            mantener Zoom como archivo historico.
          </p>
        </div>
        <button type="button">Nueva solicitud</button>
      </section>

      <section className="metrics" aria-label="Resumen operativo">
        {metrics.map((metric) => (
          <article className="metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="grid">
        <article className="panel" id="solicitudes">
          <h2>Flujo principal</h2>
          <ul className="workflow">
            {workflows.map((workflow) => (
              <li key={workflow}>{workflow}</li>
            ))}
          </ul>
        </article>

        <article className="panel" id="agenda">
          <h2>Agenda Meet</h2>
          <p className="muted">
            El proveedor operativo sera Google Meet. Las entidades centrales hablan de
            instancias, proveedores y enlaces externos, no de Zoom.
          </p>
        </article>

        <article className="panel" id="historico">
          <h2>Zoom historico</h2>
          <p className="muted">
            Las reuniones y grabaciones anteriores se importan como registros historicos,
            sin habilitar nuevos flujos operativos sobre Zoom.
          </p>
        </article>
      </section>
    </main>
  );
}
import { signOut } from "@/auth";
