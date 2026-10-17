import { describe, expect, it, vi } from "vitest";
import { asegurarLecturaInstitucionalPlanilla } from "../src/modules/archivos/infrastructure/google/google-meet-attendance-sharing.client";

type Permission = { id: string; type: string; domain: string; role: string; allowFileDiscovery: boolean };

function client(options: { permissions?: Permission[]; failCreate?: boolean; neverPersist?: boolean } = {}) {
  let permissions = [...(options.permissions ?? [])];
  const request = vi.fn(async (input: { url: string; method: string; data?: Record<string, unknown> }) => {
    const url = new URL(input.url);
    if (input.method === "GET" && url.pathname.endsWith("/permissions")) {
      return { data: { permissions } };
    }
    if (input.method === "POST") {
      if (options.failCreate) throw { code: 403 };
      if (!options.neverPersist) {
        permissions.push({ id: "domain-1", ...(input.data as Omit<Permission, "id">) });
      }
      return { data: { id: "domain-1" } };
    }
    if (input.method === "PATCH") {
      permissions = permissions.map((p) => ({ ...p, allowFileDiscovery: false }));
      return { data: { id: "domain-1" } };
    }
    throw new Error("Unexpected Drive request");
  });
  return { request };
}

describe("acceso institucional a planillas de asistencia", () => {
  it("crea permiso de lector para flacso.edu.uy sin acceso público, y verifica la ACL", async () => {
    const auth = client();
    await asegurarLecturaInstitucionalPlanilla(auth as never, "sheet-1");
    const create = auth.request.mock.calls.map(([data]) => data).find((call) => call.method === "POST");
    expect(create?.data).toEqual({
      type: "domain", domain: "flacso.edu.uy", role: "reader", allowFileDiscovery: false,
    });
    expect(create?.url).toContain("supportsAllDrives=true");
    expect(auth.request.mock.calls.filter(([data]) => data.method === "GET")).toHaveLength(2);
    expect(JSON.stringify(auth.request.mock.calls)).not.toContain('"type":"anyone"');
  });

  it("no crea permisos duplicados si la planilla ya es legible por el dominio", async () => {
    const auth = client({ permissions: [{
      id: "domain-1", type: "domain", domain: "flacso.edu.uy", role: "reader", allowFileDiscovery: false,
    }] });
    await asegurarLecturaInstitucionalPlanilla(auth as never, "sheet-1");
    expect(auth.request).toHaveBeenCalledTimes(1);
  });

  it("no considera éxito un POST sin permiso confirmado", async () => {
    const auth = client({ neverPersist: true });
    await expect(asegurarLecturaInstitucionalPlanilla(auth as never, "sheet-1"))
      .rejects.toThrow("no confirmó acceso de lectura");
  });

  it("no oculta un error 403 de políticas de Drive", async () => {
    const auth = client({ failCreate: true });
    await expect(asegurarLecturaInstitucionalPlanilla(auth as never, "sheet-1"))
      .rejects.toMatchObject({ code: 403 });
  });

  it("desactiva descubrimiento interno cuando existe un permiso previo que permite encontrar la planilla", async () => {
    const auth = client({ permissions: [{
      id: "domain-1", type: "domain", domain: "flacso.edu.uy", role: "reader", allowFileDiscovery: true,
    }] });
    await asegurarLecturaInstitucionalPlanilla(auth as never, "sheet-1");
    const patch = auth.request.mock.calls.map(([data]) => data).find((call) => call.method === "PATCH");
    expect(patch?.data).toEqual({ allowFileDiscovery: false });
    expect(auth.request.mock.calls.filter(([data]) => data.method === "GET")).toHaveLength(2);
  });
});
