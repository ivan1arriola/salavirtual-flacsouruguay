import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { MeetHostsConfig } from "../src/components/meet-hosts-config";
import { WorkspaceConfigForm } from "../src/components/workspace-config-form";

describe("configuración sin Google Meet", () => {
  it("Salas muestra solo cuentas Zoom y no ofrece agregar salas Meet", () => {
    const html = renderToStaticMarkup(
      <MeetHostsConfig
        hosts={[
          {
            id: "z1",
            nombre: "Zoom 1",
            emailOrganizador: "z1@flacso.edu.uy",
            prioridad: 1,
            limiteConcurrente: 1,
            tieneLicencia: true,
            activa: true,
            passwordConfigurada: false,
            enUso: false,
            proveedorTipo: "ZOOM"
          }
        ]}
      />
    );
    expect(html).toContain("Zoom 1");
    expect(/meet/i.test(html)).toBe(false);
    expect(html.includes("Agregar sala")).toBe(false);
  });

  it("Google no ofrece verificar ni resincronizar co-hosts, credenciales históricas ni acceso a salas", () => {
    const html = renderToStaticMarkup(<WorkspaceConfigForm initial={null} />);
    const presentes = [
      "Verificación global de cohosts",
      "Actualizar cohosts",
      "Compatibilidad histórica",
      "Acceso a salas"
    ].filter((texto) => html.includes(texto));
    expect(presentes).toEqual([]);
  });
});
