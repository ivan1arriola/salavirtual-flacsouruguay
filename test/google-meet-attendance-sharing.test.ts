import { describe, expect, it, vi } from "vitest";
import { asegurarLecturaPorEnlacePlanilla } from "../src/modules/archivos/infrastructure/google/google-meet-attendance-sharing.client";

type Permission = { id: string; type: string; domain?: string; role: string; allowFileDiscovery: boolean };

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
        permissions.push({ id: "link-1", ...(input.data as Omit<Permission, "id">) });
      }
      return { data: { id: "link-1" } };
    }
    if (input.method === "PATCH") {
      permissions = permissions.map((p) => ({ ...p, role: "reader", allowFileDiscovery: false }));
      return { data: { id: "link-1" } };
    }
    throw new Error("Unexpected Drive request");
  });
  return { request };
}

describe("acceso de lectura a planillas por enlace", () => {
  it("crea permiso público solo mediante enlace, sin descubrimiento ni edición, y verifica la ACL", async () => {
    const auth = client();
    await asegurarLecturaPorEnlacePlanilla(auth as never, "sheet-1");
    const create = auth.request.mock.calls.map(([data]) => data).find((call) => call.method === "POST");
    expect(create?.data).toEqual({
      type: "anyone", role: "reader", allowFileDiscovery: false,
    });
    expect(create?.url).toContain("supportsAllDrives=true");
    expect(auth.request.mock.calls.filter(([data]) => data.method === "GET")).toHaveLength(2);
    expect(JSON.stringify(auth.request.mock.calls)).not.toContain('"type":"domain"');
  });

  it("no duplica un permiso por enlace previamente establecido", async () => {
    const auth = client({ permissions: [{
      id: "link-1", type: "anyone", role: "reader", allowFileDiscovery: false,
    }] });
    await asegurarLecturaPorEnlacePlanilla(auth as never, "sheet-1");
    expect(auth.request).toHaveBeenCalledTimes(1);
  });

  it("no considera éxito un POST sin permiso confirmado", async () => {
    const auth = client({ neverPersist: true });
    await expect(asegurarLecturaPorEnlacePlanilla(auth as never, "sheet-1"))
      .rejects.toThrow("no confirmó el permiso 'Cualquier persona con el enlace'");
  });

  it("no oculta un error 403 de políticas de Drive", async () => {
    const auth = client({ failCreate: true });
    await expect(asegurarLecturaPorEnlacePlanilla(auth as never, "sheet-1"))
      .rejects.toMatchObject({ code: 403 });
  });

  it("desactiva descubrimiento público cuando existe un permiso previo que permite encontrar la planilla", async () => {
    const auth = client({ permissions: [{
      id: "link-1", type: "anyone", role: "reader", allowFileDiscovery: true,
    }] });
    await asegurarLecturaPorEnlacePlanilla(auth as never, "sheet-1");
    const patch = auth.request.mock.calls.map(([data]) => data).find((call) => call.method === "PATCH");
    expect(patch?.data).toEqual({ role: "reader", allowFileDiscovery: false });
    expect(auth.request.mock.calls.filter(([data]) => data.method === "GET")).toHaveLength(2);
  });
});

it("no considera suficiente un permiso de dominio y exige además el permiso por enlace", async () => {
  const auth = client({ permissions: [{
    id: "domain-1", type: "domain", domain: "flacso.edu.uy", role: "reader", allowFileDiscovery: false,
  }] });
  await asegurarLecturaPorEnlacePlanilla(auth as never, "sheet-1");
  const create = auth.request.mock.calls.map(([data]) => data).find((call) => call.method === "POST");
  expect(create?.data).toEqual({ type: "anyone", role: "reader", allowFileDiscovery: false });
});

it("degrada un enlace público editor a lector y conserva no discoverable", async () => {
  const auth = client({ permissions: [{
    id: "link-1", type: "anyone", role: "writer", allowFileDiscovery: true,
  }] });
  await asegurarLecturaPorEnlacePlanilla(auth as never, "sheet-1");
  const patch = auth.request.mock.calls.map(([data]) => data).find((call) => call.method === "PATCH");
  expect(patch?.data).toEqual({ role: "reader", allowFileDiscovery: false });
  expect(auth.request.mock.calls.filter(([data]) => data.method === "POST")).toHaveLength(0);
});
