"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Fila = Readonly<{ id: string; titulo: string; inicio: string; host: string }>;
type Avisos = Readonly<{
  estado: "COMPLETO" | "PARCIAL" | "NO_APLICA" | "NO_CONFIGURADO";
  motivo?: string;
  enviados: number;
  yaEnviados: number;
  enCurso: number;
  errores: number;
  detalle: readonly Readonly<{ email: string; estado: string; error?: string }>[];
}>;
type Resultado = Readonly<{ instanciaId: string; resultado: string; etapa: string; mensaje?: string; avisos?: Avisos }>;

function resumenAvisos(avisos: Avisos): string {
  if (avisos.estado === "NO_CONFIGURADO" || avisos.estado === "NO_APLICA") return `Avisos por correo no enviados: ${avisos.motivo ?? avisos.estado}`;
  const partes = [`${avisos.enviados} enviado(s)`];
  if (avisos.yaEnviados) partes.push(`${avisos.yaEnviados} ya enviado(s) antes`);
  if (avisos.enCurso) partes.push(`${avisos.enCurso} pendientes de revisión manual`);
  if (avisos.errores) partes.push(`${avisos.errores} con error`);
  return `Avisos por correo: ${partes.join(", ")}${avisos.estado === "PARCIAL" && avisos.motivo ? ` — ${avisos.motivo}` : ""}`;
}

export function MigracionZoomAplicarControl({ filas, filasEnZoom = [] }: Readonly<{ filas: readonly Fila[]; filasEnZoom?: readonly Fila[] }>) {
  const router = useRouter();
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [resultados, setResultados] = useState<readonly Resultado[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function aplicar(modo: "PILOTO" | "LOTE", ids: readonly string[] = seleccion) {
    setProcesando(true);
    setError(null);
    setResultados(null);
    try {
      const response = await fetch("/api/v1/reuniones/migracion-zoom/aplicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo, instanciaIds: ids }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo aplicar la migración.");
      setResultados(payload.resultados);
      setSeleccion([]);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo aplicar la migración.");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <section aria-label="Aplicar migración a Zoom">
      <h2>Convertir encuentros revisados</h2>
      <p>Seleccioná hasta 10 encuentros migrables. El piloto convierte exactamente uno. Cada encuentro se vuelve a validar al aplicar.</p>
      {filas.length === 0 ? <p>No hay encuentros migrables en esta vista previa.</p> : (
        <ul>
          {filas.map((fila) => (
            <li key={fila.id}>
              <label>
                <input
                  type="checkbox"
                  checked={seleccion.includes(fila.id)}
                  disabled={procesando || (!seleccion.includes(fila.id) && seleccion.length >= 10)}
                  onChange={(event) => setSeleccion((actual) => event.target.checked ? [...actual, fila.id] : actual.filter((id) => id !== fila.id))}
                />
                {fila.titulo} — {new Date(fila.inicio).toLocaleString("es-UY")} — {fila.host}
              </label>
            </li>
          ))}
        </ul>
      )}
      <p>{seleccion.length} seleccionado(s)</p>
      <button type="button" disabled={procesando || seleccion.length !== 1} onClick={() => aplicar("PILOTO")}>Convertir piloto</button>{" "}
      <button type="button" disabled={procesando || seleccion.length < 1 || seleccion.length > 10} onClick={() => aplicar("LOTE")}>Convertir lote seleccionado</button>
      {filasEnZoom.length > 0 && (
        <div>
          <h3>Avisos de encuentros ya convertidos</h3>
          <p>Podés revisar o reintentar los avisos de cada encuentro que conserva un registro Meet histórico.</p>
          <ul>{filasEnZoom.map((fila) => (
            <li key={fila.id}>{fila.titulo} — <button type="button" disabled={procesando} onClick={() => aplicar("PILOTO", [fila.id])}>Revisar avisos</button></li>
          ))}</ul>
        </div>
      )}
      {procesando && <p role="status">Convirtiendo encuentros…</p>}
      {error && <p role="alert">{error}</p>}
      {resultados && (
        <div role="status">
          <h3>Resultado</h3>
          <ul>
            {resultados.map((resultado) => (
              <li key={resultado.instanciaId}>
                {resultado.instanciaId}: {resultado.resultado} ({resultado.etapa}){resultado.mensaje ? ` — ${resultado.mensaje}` : ""}
                {resultado.avisos && (
                  <div>
                    <p>{resumenAvisos(resultado.avisos)}</p>
                    {resultado.avisos.detalle.some((d) => d.estado === "ERROR") && (
                      <ul>
                        {resultado.avisos.detalle.filter((d) => d.estado === "ERROR").map((d) => (
                          <li key={d.email}>{d.email}: error{d.error ? ` (${d.error})` : ""}</li>
                        ))}
                      </ul>
                    )}
                    {(resultado.avisos.errores > 0 || Boolean(resultado.avisos.motivo)) && (
                      <button type="button" disabled={procesando} onClick={() => aplicar("PILOTO", [resultado.instanciaId])}>
                        Reintentar avisos pendientes
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
