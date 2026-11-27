import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  MonitoringMeetingRow,
  type MonitoringMeetingRowData,
} from "../src/modules/asistencia/presentation/components/monitoring-meeting-row";

const base: MonitoringMeetingRowData = {
  id: "i1",
  detalleHref: "/reuniones/s1",
  gestionarHref: "/monitoreo/gestionar/i1",
  titulo: "Formación BROU",
  programa: "Programa Género",
  docente: "Florencia Quartino",
  horaAsistencia: "17:45–20:00 h",
  covered: false,
  assistantName: null,
  plataforma: "ZOOM",
  joinUrl: "https://zoom.us/j/84039254055",
  hostLabel: "sala02 · sala02@flacso.edu.uy",
  codigoReunion: "84039254055",
  modalidad: "VIRTUAL",
  horarioReunion: null,
  applicantsCount: 0,
  cuenta: "3",
};

const render = (over: Partial<MonitoringMeetingRowData> = {}) =>
  renderToStaticMarkup(<MonitoringMeetingRow data={{ ...base, ...over }} />);

describe("fila compacta de monitoreo", () => {
  it("pendiente: destaca y ofrece Asignar", () => {
    const html = render();
    expect(html).toContain("is-pending");
    expect(html).toContain("Pendiente");
    expect(html).toContain('href="/monitoreo/gestionar/i1"');
    expect(html).toContain(">Asignar<");
    expect(html).not.toContain(">Gestionar<");
  });

  it("cubierta: muestra la persona y ofrece Gestionar", () => {
    const html = render({ covered: true, assistantName: "Iván Arriola" });
    expect(html).toContain("is-covered");
    expect(html).toContain("Iván Arriola");
    expect(html).toContain(">Gestionar<");
    expect(html).not.toContain(">Asignar<");
  });

  it("incluye detalle expandible con host, número y postulados", () => {
    const html = render({ applicantsCount: 1 });
    expect(html).toContain("<details");
    expect(html).toContain("Host");
    expect(html).toContain("1 persona postulada");
    expect(html).toContain('aria-label="1 persona postulada"');
    expect(html).toContain("N.º de reunión");
    expect(html).toContain("84039254055");
    expect(html).toContain("1 persona postulada");
    expect(render()).toContain("0 personas postuladas");
    expect(render()).toContain('aria-label="0 personas postuladas"');
  });

  it("enlaces: con joinUrl abre Zoom y ver detalle; sin joinUrl avisa", () => {
    const html = render();
    expect(html).toContain("Abrir Zoom");
    expect(html).toContain("Ver detalle");
    expect(render({ joinUrl: null })).toContain("Enlace pendiente");
  });

  it("omite datos ausentes sin imprimir undefined/null", () => {
    const html = render({ hostLabel: null, codigoReunion: null, plataforma: "GOOGLE_MEET" });
    expect(html).toContain("Sin cuenta host asignada");
    expect(html).toContain("is-meet");
    expect(render({ plataforma: null })).toContain("is-none");
    expect(html).not.toContain("N.º de reunión");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("null");
  });

  it("híbrida muestra el horario de reunión; virtual no", () => {
    const hib = render({ modalidad: "HIBRIDA", horarioReunion: "09:00–11:00 h" });
    expect(hib).toContain("Horario de reunión");
    expect(hib).toContain("09:00–11:00 h");
    expect(render()).not.toContain("Horario de reunión");
  });

  it("propaga el color de cuenta", () => {
    expect(render({ cuenta: "3" })).toContain('data-cuenta="3"');
  });
});
