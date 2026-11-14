import { Prisma, type PrismaClient } from "@prisma/client";

const TAMANO_PAGINA = 50;

/** Consulta solo importaciones; no convierte sus enlaces en enlaces operativos. */
export async function consultarRegistrosZoomImportados(
  db: PrismaClient,
  parametros: Readonly<{ busqueda?: string | string[]; pagina?: string | string[] }>
) {
  const busqueda = (typeof parametros.busqueda === "string" ? parametros.busqueda : "").trim().slice(0, 120);
  const valorPagina = typeof parametros.pagina === "string" ? parametros.pagina : "";
  const paginaSolicitada = /^\d+$/.test(valorPagina) ? Math.max(1, Number(valorPagina)) : 1;
  if (busqueda) {
    // NFD y la eliminación de marcas conservan el comportamiento del filtro anterior.
    // Los valores se pasan como parámetros, incluido el texto que pueda contener % o _.
    const termino = busqueda
      .toLocaleLowerCase("es")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const fuentes = Prisma.sql`
      FROM "EventoProveedor" e
      JOIN "ProveedorReunion" p ON p.id = e."proveedorId"
      JOIN "InstanciaSala" i ON i.id = e."instanciaSalaId"
      JOIN "SolicitudSala" s ON s.id = i."solicitudSalaId"
      JOIN "DocentePrograma" dp ON dp.id = s."docenteProgramaId"
      JOIN "Programa" programa ON programa.id = dp."programaId"
      LEFT JOIN "CuentaProveedor" cuenta ON cuenta.id = e."cuentaProveedorId"
      WHERE p.tipo = 'ZOOM_HISTORICO'
        AND (
          strpos(regexp_replace(lower(normalize(s.titulo, NFD)), '[̀-ͯ]', '', 'g'), ${termino}) > 0
          OR strpos(regexp_replace(lower(normalize(programa.nombre, NFD)), '[̀-ͯ]', '', 'g'), ${termino}) > 0
          OR strpos(regexp_replace(lower(normalize(coalesce(cuenta.nombre, ''), NFD)), '[̀-ͯ]', '', 'g'), ${termino}) > 0
          OR strpos(regexp_replace(lower(normalize(coalesce(cuenta."emailOrganizador", ''), NFD)), '[̀-ͯ]', '', 'g'), ${termino}) > 0
        )`;
    const [{ total: cantidad }] = await db.$queryRaw<Array<{ total: bigint }>>(
      Prisma.sql`SELECT count(*) AS total ${fuentes}`
    );
    const total = Number(cantidad);
    const totalPaginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA));
    const pagina = Math.min(paginaSolicitada, totalPaginas);
    const ids = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT e.id ${fuentes}
      ORDER BY i."inicioProgramadoAt" DESC, e.id DESC
      LIMIT ${TAMANO_PAGINA} OFFSET ${(pagina - 1) * TAMANO_PAGINA}`);
    const registrosSinOrden = await db.eventoProveedor.findMany({
      where: { id: { in: ids.map(({ id }) => id) } },
      include: {
        cuentaProveedor: true,
        instancia: {
          include: {
            solicitud: {
              include: {
                docentePrograma: { include: { programa: true, docente: { include: { usuario: true } } } }
              }
            }
          }
        }
      }
    });
    const porId = new Map(registrosSinOrden.map((registro) => [registro.id, registro]));
    const registros = ids.flatMap(({ id }) => {
      const registro = porId.get(id);
      return registro ? [registro] : [];
    });
    return { registros, pagina, totalPaginas, total, busqueda };
  }
  const where: Prisma.EventoProveedorWhereInput = { proveedor: { tipo: "ZOOM_HISTORICO" } };
  const total = await db.eventoProveedor.count({ where });
  const totalPaginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA));
  const pagina = Math.min(paginaSolicitada, totalPaginas);
  const registros = await db.eventoProveedor.findMany({
    where,
    orderBy: [{ instancia: { inicioProgramadoAt: "desc" } }, { id: "desc" }],
    skip: (pagina - 1) * TAMANO_PAGINA,
    take: TAMANO_PAGINA,
    include: {
      cuentaProveedor: true,
      instancia: {
        include: {
          solicitud: {
            include: {
              docentePrograma: { include: { programa: true, docente: { include: { usuario: true } } } }
            }
          }
        }
      }
    }
  });
  return { registros, pagina, totalPaginas, total, busqueda };
}
