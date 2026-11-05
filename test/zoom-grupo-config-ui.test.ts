import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HostEditForm,
  HostFields,
  MeetHostsConfig,
  type MeetHostVisible
} from "../src/components/meet-hosts-config";
import { ZoomConfigForm } from "../src/components/zoom-config-form";
import { ZoomGrupoConfig } from "../src/components/zoom-grupo-config";
import { resultadoSincronizacion } from "../src/components/zoom-grupo-config.domain";
import { formatDateTime } from "../src/lib/ui/format";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

afterEach(() => {
  vi.unstubAllGlobals();
});

const MEET: MeetHostVisible = {
  id: "meet-1",
  nombre: "Sala Meet",
  emailOrganizador: "sala@flacso.edu.uy",
  prioridad: 1,
  limiteConcurrente: 2,
  tieneLicencia: true,
  activa: true,
  passwordConfigurada: true,
  enUso: false,
  proveedorTipo: "GOOGLE_MEET"
};

const ZOOM: MeetHostVisible = {
  id: "zoom-1",
  nombre: "Zoom 01",
  emailOrganizador: "zoom01@flacso.edu.uy",
  prioridad: 2,
  limiteConcurrente: 1,
  tieneLicencia: true,
  activa: true,
  passwordConfigurada: false,
  enUso: true,
  proveedorTipo: "ZOOM",
  fueraDelGrupoAt: null,
  reunionesFuturas: 0
};

const SIN_GRUPO = {
  grupoId: null,
  grupoNombre: null,
  ultimaSincronizacionFecha: null,
  ultimaSincronizacionResultado: null
};

function formularioDeEdicion(host: MeetHostVisible) {
  return renderToStaticMarkup(createElement(HostEditForm, {
    host,
    hostsCount: 2,
    saving: null,
    message: "",
    success: false,
    onSubmit: () => {},
    onDelete: () => {}
  }));
}

function botonSincronizar(html: string) {
  return html.match(/<button(?:(?!<\/button>)[\s\S])*Sincronizar con el grupo[\s\S]*?<\/button>/)?.[0] ?? "";
}

describe("Configuración › Salas: formularios de cuentas", () => {
  it("el formulario Agregar sala solo ofrece Google Meet", () => {
    const html = renderToStaticMarkup(createElement(HostFields, { hostsCount: 2 }));
    expect(html).toContain("Google Meet");
    expect(html).not.toContain('value="ZOOM"');
    expect(html).not.toContain(">Zoom<");
    expect(html).toContain('name="proveedorTipo" value="GOOGLE_MEET"');
    expect(html).toContain("Correo de Google Workspace");
    expect(html).toContain('name="password"');
    expect(html).toContain('name="limiteConcurrente"');
  });

  it("una fila Zoom no ofrece borrar", () => {
    expect(formularioDeEdicion(ZOOM)).not.toContain("Eliminar");
    expect(formularioDeEdicion(MEET)).toContain("Eliminar");
  });

  it("una fila Zoom muestra nombre, correo y licencia sin poder editarlos; solo prioridad y estado", () => {
    const html = formularioDeEdicion(ZOOM);
    expect(html).not.toContain('name="nombre"');
    expect(html).not.toContain('name="email"');
    expect(html).not.toContain('name="tieneLicencia"');
    expect(html).not.toContain('name="password"');
    expect(html).not.toContain('name="limiteConcurrente"');
    expect(html).toMatch(/<input(?=[^>]*value="Zoom 01")(?=[^>]*readonly="")[^>]*>/i);
    expect(html).toMatch(/<input(?=[^>]*value="zoom01@flacso.edu.uy")(?=[^>]*readonly="")[^>]*>/i);
    expect(html).toMatch(/<input(?=[^>]*value="Con licencia")(?=[^>]*readonly="")[^>]*>/i);
    expect(html).toContain('name="prioridad"');
    expect(html).toContain('name="activa"');
  });

  it("una fila Meet conserva todos sus campos y el borrado", () => {
    const html = formularioDeEdicion(MEET);
    for (const campo of ["nombre", "email", "password", "prioridad", "limiteConcurrente", "tieneLicencia", "activa", "notificarCambioPassword"]) {
      expect(html).toContain(`name="${campo}"`);
    }
    expect(html).toContain("Correo de Google Workspace");
    expect(html).toContain("Eliminar esta sala");
  });
});

describe("Configuración › Salas: lista de cuentas", () => {
  it("una cuenta fuera del grupo muestra el aviso con la cantidad de reuniones futuras", () => {
    const html = renderToStaticMarkup(createElement(MeetHostsConfig, {
      hosts: [MEET, { ...ZOOM, fueraDelGrupoAt: "2026-11-01T12:00:00.000Z", reunionesFuturas: 3 }]
    }));
    expect(html).toContain("Fuera del grupo (3 reuniones futuras)");
  });

  it("una cuenta fuera del grupo figura como no disponible", () => {
    const html = renderToStaticMarkup(createElement(MeetHostsConfig, {
      hosts: [{ ...ZOOM, fueraDelGrupoAt: "2026-11-01T12:00:00.000Z", reunionesFuturas: 1 }]
    }));
    expect(html).toContain("Fuera del grupo (1 reunión futura)");
    expect(html).toContain("No disponible");
    expect(html).not.toContain(">Disponible<");
  });

  it("una cuenta Zoom del grupo no muestra el aviso", () => {
    const html = renderToStaticMarkup(createElement(MeetHostsConfig, { hosts: [ZOOM] }));
    expect(html).not.toContain("Fuera del grupo");
    expect(html).toContain(">Disponible<");
  });
});

describe("Configuración › Salas: grupo de Zoom", () => {
  it("sin grupo elegido se muestra el aviso para elegirlo", () => {
    const html = renderToStaticMarkup(createElement(ZoomGrupoConfig, SIN_GRUPO));
    expect(html).toContain("Elegí un grupo de Zoom para obtener las cuentas anfitrionas");
    expect(html).toContain("Elegir grupo");
    expect(botonSincronizar(html)).toContain('disabled=""');
  });

  it("con grupo elegido muestra el grupo, la fecha y el resultado de la última sincronización", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    // La página formatea la fecha en el servidor (es-UY, Montevideo) para no depender del navegador.
    const fecha = formatDateTime(new Date("2026-11-05T13:30:00.000Z"));
    const html = renderToStaticMarkup(createElement(ZoomGrupoConfig, {
      grupoId: "g-1",
      grupoNombre: "Salas FLACSO",
      ultimaSincronizacionFecha: fecha,
      ultimaSincronizacionResultado: "2 nuevas, 1 desactivada"
    }));
    expect(html).toContain("Salas FLACSO");
    expect(html).toContain(fecha);
    expect(html).toContain("2 nuevas, 1 desactivada");
    expect(html).not.toContain("Elegí un grupo de Zoom para obtener las cuentas anfitrionas");
    expect(html).toContain("Cambiar grupo");
    const boton = botonSincronizar(html);
    expect(boton).toContain("Sincronizar con el grupo");
    expect(boton).not.toContain("disabled");
    // La lista de grupos se pide a Zoom al abrir el selector, no al cargar la página.
    expect(fetch).not.toHaveBeenCalled();
    expect(html).not.toContain("<select");
  });

  it("con grupo pero sin sincronizar todavía lo dice", () => {
    const html = renderToStaticMarkup(createElement(ZoomGrupoConfig, { ...SIN_GRUPO, grupoId: "g-1", grupoNombre: "Salas FLACSO" }));
    expect(html).toContain("Todavía no se sincronizó");
  });
});

describe("ayuda de permisos de la app de Zoom", () => {
  it("lista los permisos granulares, incluidos los de grupos", () => {
    const html = renderToStaticMarkup(createElement(ZoomConfigForm, { initial: null }));
    for (const permiso of [
      "meeting:write:meeting:admin",
      "meeting:read:meeting:admin",
      "meeting:update:meeting:admin",
      "meeting:delete:meeting:admin",
      "meeting:read:list_meetings:admin",
      "group:read:list_groups:admin",
      "group_member:read:list_members:admin"
    ]) {
      expect(html).toContain(permiso);
    }
    expect(html).not.toContain("user:read:admin");
  });
});

describe("resultado de la sincronización", () => {
  it("lee ok y resumen de la respuesta, también cuando no se pudo sincronizar", () => {
    expect(resultadoSincronizacion({ ok: true, resumen: "2 nuevas" })).toEqual({ ok: true, mensaje: "2 nuevas" });
    expect(resultadoSincronizacion({ ok: false, resumen: "Ya hay una sincronización en curso." }))
      .toEqual({ ok: false, mensaje: "Ya hay una sincronización en curso." });
  });

  it("si no hay resumen usa el error y, si tampoco, un mensaje propio", () => {
    expect(resultadoSincronizacion({ error: "La sesión está desactualizada. Volvé a iniciar sesión." }))
      .toEqual({ ok: false, mensaje: "La sesión está desactualizada. Volvé a iniciar sesión." });
    expect(resultadoSincronizacion(null)).toEqual({
      ok: false,
      mensaje: "No se pudo sincronizar con el grupo de Zoom. Probá de nuevo."
    });
    expect(resultadoSincronizacion({ ok: "si", resumen: 3 })).toEqual({
      ok: false,
      mensaje: "No se pudo sincronizar con el grupo de Zoom. Probá de nuevo."
    });
  });
});
