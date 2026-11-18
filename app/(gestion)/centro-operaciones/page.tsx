import { Activity, ArrowRight, CloudCog, Search, UsersRound, Video } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import styles from "./centro-operaciones.module.css";

const operationalLinks = [
  {
    href: "/monitoreo?estado=pendientes",
    title: "Monitoreos sin asignar",
    description: "Revisá las reuniones que necesitan cobertura de monitoreo.",
    icon: UsersRound
  },
  {
    href: "/reuniones/buscar-meet",
    title: "Buscar una reunión en Google Meet",
    description: "Localizá reuniones por enlace o código para revisar su vinculación.",
    icon: Search
  },
  {
    href: "/reuniones/duplicados",
    title: "Revisar reuniones duplicadas",
    description: "Verificá coincidencias entre reuniones antes de actuar.",
    icon: Activity
  },
  {
    href: "/centro-operaciones/zoom",
    title: "Diagnóstico de Zoom",
    description: "Revisá cuentas anfitrionas, consistencia de series y reuniones pasadas.",
    icon: Video
  },
  {
    href: "/configuracion/google",
    title: "Configuración de Google",
    description: "Revisá la cuenta de servicio, la delegación y el destino de Drive.",
    icon: CloudCog
  }
] as const;

export default async function CentroOperacionesPage() {
  const session = await auth();
  if (session?.user.role !== "ADMINISTRACION") {
    redirect("/");
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Sistema</p>
        <h1>Centro de operaciones</h1>
        <p>Accedé a revisiones y tareas de operación que pueden requerir intervención.</p>
      </header>
      <section aria-label="Tareas de operación" className={styles.links}>
        {operationalLinks.map(({ href, title, description, icon: Icon }) => (
          <Link className={styles.link} href={href} key={href}>
            <Icon aria-hidden="true" className={styles.icon} size={20} />
            <span className={styles.copy}>
              <strong>{title}</strong>
              <small>{description}</small>
            </span>
            <ArrowRight aria-hidden="true" className={styles.arrow} size={18} />
          </Link>
        ))}
      </section>
    </div>
  );
}
