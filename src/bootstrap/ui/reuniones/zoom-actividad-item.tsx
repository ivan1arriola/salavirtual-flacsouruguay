import { CircleAlert, FileVideo, MonitorUp, PlayCircle, UsersRound } from "lucide-react";
import {
  traducirDetalleActividadZoom,
  type EntradaActividadZoom
} from "@/src/modules/reuniones/presentation/actividad-encuentro-zoom";
import styles from "./reunion-zoom-operativa.module.css";

const hora = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

const ICONOS_ACTIVIDAD: ReadonlyArray<readonly [readonly string[], typeof FileVideo]> = [
  [["grabación"], FileVideo],
  [["pantalla"], MonitorUp],
  [["participante", "sala de espera"], UsersRound],
  [["alerta"], CircleAlert]
];

function IconoActividad({ etiqueta }: Readonly<{ etiqueta: string }>) {
  const texto = etiqueta.toLowerCase();
  const Icono = ICONOS_ACTIVIDAD.find(([claves]) => claves.some((c) => texto.includes(c)))?.[1] ?? PlayCircle;
  return <Icono size={17} />;
}

export function ItemActividad({ a }: Readonly<{ a: EntradaActividadZoom }>) {
  const detalle = traducirDetalleActividadZoom(a.detalle);
  return (
    <li>
      <time dateTime={a.desde.toISOString()}>{hora.format(a.desde)}</time>
      <span className={styles.timelineIcon} aria-hidden="true">
        <IconoActividad etiqueta={a.etiqueta} />
      </span>
      <span className={styles.timelineLabel}>
        {a.etiqueta}
        {a.cantidad > 1 ? ` (hasta ${hora.format(a.hasta)})` : ""}
        {a.participanteNombre ? <small>{a.participanteNombre}</small> : null}
        {a.participanteEmail ? <small>{a.participanteEmail}</small> : null}
        {a.motivoSalida ? <small>Motivo de salida: {a.motivoSalida}</small> : null}
        {detalle ? <small> · {detalle}</small> : null}
      </span>
    </li>
  );
}
