import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const leer = (ruta: string) => readFileSync(ruta, "utf8").replace(/\r\n/g, "\n");
const UNIDAD = "salavirtual-zoom-archivos.service";

describe("unidad systemd del worker Zoom", () => {
  const u = leer("infra/ec2/salavirtual-zoom-archivos.service");
  it("proceso aparte de Next, reinicio solo ante fallo y apagado ordenado más largo que la espera HTTP de 60 s", () => {
    expect(u).toMatch(/^ExecStart=\/usr\/bin\/node .*zoom-archivos-worker\.cjs/m);
    expect(u).not.toMatch(/server\.js/);
    expect(u).toMatch(/^Restart=on-failure$/m);
    const timeout = Number(/^TimeoutStopSec=(\d+)$/m.exec(u)?.[1]);
    expect(timeout).toBeGreaterThan(60);
    expect(timeout).toBe(90);
    expect(u).toMatch(/^KillSignal=SIGTERM$/m);
  });
  it("usuario de servicio existente, entorno compartido, memoria y CPU acotadas", () => {
    expect(u).toMatch(/^User=salavirtual$/m);
    expect(u).toMatch(/^EnvironmentFile=\/srv\/apps\/salavirtual-flacso\/shared\/\.env\.production$/m);
    expect(u).toMatch(/^MemoryMax=\d+[MG]$/m);
    expect(u).toMatch(/^CPUQuota=\d+%$/m);
    expect(u).toMatch(/^WorkingDirectory=\/srv\/apps\/salavirtual-flacso\/current$/m);
  });
  it("se tiene que activar a mano: no hay WantedBy automático que lo arranque sin decisión", () => {
    // El `enable` lo hace un administrador tras la prueba real; deploy.sh solo reinicia si ya está habilitado.
    expect(u).toMatch(/^\[Install\]$/m);
  });
});

describe("deploy.sh: el worker nunca corre código de un release rechazado", () => {
  const d = leer("infra/ec2/deploy.sh");
  const pos = (texto: string, desde = 0) => {
    const i = d.indexOf(texto, desde);
    expect(i, `falta: ${texto}`).toBeGreaterThanOrEqual(0);
    return i;
  };

  it("detiene el worker antes del build", () => {
    expect(pos("detener_worker_zoom\n")).toBeLessThan(pos("npm run build"));
  });
  it("empaqueta el worker dentro del release y comprueba que Prisma esté disponible", () => {
    expect(d).toMatch(/build:zoom-worker/);
    expect(d).toMatch(/zoom-archivos-worker\.cjs/);
    expect(d).toMatch(/node_modules\/@prisma\/client/);
  });
  it("instala la unidad y recarga systemd", () => {
    expect(d).toContain(`infra/ec2/${UNIDAD}`);
    expect(pos(`/etc/systemd/system/${UNIDAD}`)).toBeLessThan(pos("systemctl daemon-reload"));
  });
  it("solo reinicia el worker si ya está habilitado, tras comprobar la salud del release nuevo", () => {
    expect(d).toMatch(/is-enabled --quiet/);
    const salud = pos("HEALTH_OK=1");
    const ok = pos("Deploy OK");
    const reinicioFinal = d.indexOf("reiniciar_worker_zoom\n", salud);
    expect(reinicioFinal).toBeGreaterThan(salud);
    expect(reinicioFinal).toBeLessThan(ok);
  });
  it("tras revertir `current` en un deploy fallido reinicia el worker con el código anterior, no el rechazado", () => {
    const rollback = pos('mv -Tf "$BASE/.current-rollback-$SHA" "$BASE/current"');
    const reinicio = d.indexOf("reiniciar_worker_zoom", rollback);
    expect(reinicio).toBeGreaterThan(rollback);
    expect(reinicio).toBeLessThan(pos("exit 1", rollback));
  });
  it("el reinicio exige que `current` contenga el bundle del worker (un release anterior sin él lo deja detenido)", () => {
    expect(d).toMatch(/-f "\$BASE\/current\/zoom-archivos-worker\.cjs"/);
  });
});

describe("deploy-ec2.sh --rollback", () => {
  const s = leer("scripts/deploy-ec2.sh");
  const bloque = s.slice(s.indexOf("Modo Rollback"), s.indexOf("Validaciones de CI Local"));
  it("detiene el worker antes de cambiar `current` y lo reinicia después, también al restaurar", () => {
    const detener = bloque.indexOf(`systemctl stop ${UNIDAD}`);
    const primerCambio = bloque.indexOf('mv -Tf "$BASE/.rollback-next-$" "$BASE/current"');
    expect(detener).toBeGreaterThanOrEqual(0);
    expect(detener).toBeLessThan(primerCambio);
    const reinicios = [...bloque.matchAll(/reiniciar_worker_zoom$/gm)].map((m) => m.index!);
    expect(reinicios.length).toBeGreaterThanOrEqual(2);
    expect(reinicios[0]).toBeGreaterThan(primerCambio);
    const restaurar = bloque.indexOf('mv -Tf "$BASE/.rollback-restore-$" "$BASE/current"');
    expect(reinicios.some((i) => i > restaurar)).toBe(true);
  });
  it("estado muestra también el worker", () => {
    expect(s).toContain(UNIDAD);
  });
});
