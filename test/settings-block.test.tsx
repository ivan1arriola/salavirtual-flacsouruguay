import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsBlock, SettingsNotices } from "../src/components/settings-block";

describe("bloque de configuración", () => {
  it("muestra el resumen y deja el formulario dentro de Editar", () => {
    const html = renderToStaticMarkup(
      <SettingsBlock title="Conexión" summary={<span>Credenciales guardadas</span>}>
        <input name="clave" />
      </SettingsBlock>
    );
    expect(html).toContain("<h2");
    expect(html).toContain("Conexión");
    expect(html).toContain("Credenciales guardadas");
    expect(html).toMatch(/<details(?![^>]*\sopen)[^>]*>.*Editar.*<input name="clave"/s);
  });

  it("abre el formulario cuando defaultOpen", () => {
    const html = renderToStaticMarkup(
      <SettingsBlock title="Conexión" summary="x" defaultOpen>
        <input />
      </SettingsBlock>
    );
    expect(html).toMatch(/<details[^>]*\sopen/);
  });

  it("dibuja el estado con su tono", () => {
    const html = renderToStaticMarkup(
      <SettingsBlock title="t" summary="s" status={{ tone: "warning", label: "Falta configurar" }}>
        <p />
      </SettingsBlock>
    );
    expect(html).toContain("settings-section-status is-warning");
    expect(html).toContain("Falta configurar");
  });
});

describe("avisos de configuración", () => {
  const mensajes = { listo: "Guardado." };
  it("muestra el mensaje conocido y el error", () => {
    const html = renderToStaticMarkup(<SettingsNotices estado="listo" error="Falló" mensajes={mensajes} />);
    expect(html).toContain("Guardado.");
    expect(html).toContain("Falló");
    expect(html).toContain('role="alert"');
  });
  it("ignora un estado desconocido", () => {
    const html = renderToStaticMarkup(<SettingsNotices estado="otro" mensajes={mensajes} />);
    expect(html).toBe("");
  });
});
