type MonitoringAssignment = Readonly<{
  estado: string;
  asistenteTecnico: Readonly<{
    usuario: Readonly<{ nombres: string; apellidos: string | null }>;
  }>;
}>;

export function TeacherMonitoringStatus({
  requiereMonitoreo,
  asignaciones,
  historico = false
}: Readonly<{
  requiereMonitoreo: boolean;
  asignaciones: readonly MonitoringAssignment[];
  historico?: boolean;
}>) {
  const asignacion = asignaciones.find(({ estado }) => estado === "ASIGNADO" || estado === "ACEPTADO");
  const usuario = asignacion?.asistenteTecnico.usuario;
  const nombre = usuario ? [usuario.nombres, usuario.apellidos].filter(Boolean).join(" ").trim() : "";

  if (requiereMonitoreo && asignacion) {
    return (
      <div data-state="asignado">
        <dt>Monitoreo técnico</dt>
        <dd>
          <strong>{nombre || "Nombre no disponible"}</strong>
          <span>Asignado</span>
        </dd>
      </div>
    );
  }

  if (!requiereMonitoreo) {
    return (
      <div data-state="no-requerido">
        <dt>Monitoreo técnico</dt>
        <dd>No requiere monitoreo</dd>
      </div>
    );
  }

  return (
    <div data-state={historico ? "sin-registro" : "pendiente"}>
      <dt>Monitoreo técnico</dt>
      <dd>{historico ? "Sin asignación registrada" : "Pendiente de asignación"}</dd>
    </div>
  );
}
