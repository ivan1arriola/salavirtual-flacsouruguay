import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { requiereCompletarRegistro } from "@/src/modules/usuarios/registro-institucional.domain";
import { guardarRegistroInstitucional } from "./actions";

export default async function CompletarRegistroPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ error?: string }> }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo) redirect("/acceso");
  const [user, programs] = await Promise.all([
    db.usuario.findUnique({
      where: { id: actor.id },
      select: {
        nombres: true,
        rol: true,
        docente: { select: { _count: { select: { programas: { where: { activo: true } } } } } }
      }
    }),
    db.programa.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true }
    })
  ]);
  if (!user || !requiereCompletarRegistro({
    rol: user.rol,
    programasActivos: user.docente?._count.programas ?? 0
  })) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="login-shell">
      <section className="login-panel registration-panel">
        <header className="login-header">
          <p className="eyebrow">Primer ingreso</p>
          <h1>Completá tu registro</h1>
          <p>Hola, {user.nombres}. Para continuar tenés que indicar el programa académico con el que trabajás.</p>
        </header>
        {error ? <p className="login-error" role="alert">{error}</p> : null}
        <form className="login-form" action={guardarRegistroInstitucional}>
          <label htmlFor="programaId">Elegir un programa existente</label>
          <select id="programaId" name="programaId" defaultValue="">
            <option value="">Seleccionar programa</option>
            {programs.map(({ id, nombre }) => <option key={id} value={id}>{nombre}</option>)}
          </select>
          <div className="login-separator"><span>o</span></div>
          <label htmlFor="programaNuevo">Crear un programa</label>
          <input id="programaNuevo" name="programaNuevo" maxLength={180} placeholder="Nombre completo del programa" />
          <small>Completá solamente una de las dos opciones.</small>
          <button type="submit">Completar registro</button>
        </form>
      </section>
    </main>
  );
}
