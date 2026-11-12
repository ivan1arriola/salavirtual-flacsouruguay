/** Modelos en memoria de `avisoMigracionZoom` y `usuario` para probar la outbox sin base real. */
export type FilaAviso = {
  id: string;
  instanciaSalaId: string;
  email: string;
  estado: string;
  intentos: number;
  errorCodigo: string | null;
  enviadoAt: Date | null;
  joinUrl: string;
};

export function crearOutboxFake(
  usuarios: { id: string; nombres: string; emailPrincipal: string | null }[] = []
) {
  const filas: FilaAviso[] = [];
  let seq = 0;
  const avisoMigracionZoom = {
    create: async ({ data }: any) => {
      if (filas.some((f) => f.instanciaSalaId === data.instanciaSalaId && f.email === data.email)) {
        throw Object.assign(new Error("Unique"), { code: "P2002" });
      }
      const fila: FilaAviso = {
        id: `av${++seq}`,
        instanciaSalaId: data.instanciaSalaId,
        email: data.email,
        estado: data.estado,
        intentos: 1,
        errorCodigo: null,
        enviadoAt: null,
        joinUrl: data.joinUrl
      };
      filas.push(fila);
      return { id: fila.id };
    },
    findUnique: async ({ where }: any) => {
      const { instanciaSalaId, email } = where.instanciaSalaId_email;
      return filas.find((f) => f.instanciaSalaId === instanciaSalaId && f.email === email) ?? null;
    },
    updateMany: async ({ where, data }: any) => {
      const fila = filas.find((f) => f.id === where.id && f.estado === where.estado);
      if (!fila) {
        return { count: 0 };
      }
      const { intentos, ...resto } = data;
      Object.assign(fila, resto);
      if (intentos?.increment) {
        fila.intentos += intentos.increment;
      }
      return { count: 1 };
    },
    update: async ({ where, data }: any) => {
      Object.assign(
        filas.find((f) => f.id === where.id)!,
        data
      );
      return {};
    }
  };
  const usuario = {
    findMany: async ({ where }: any) => usuarios.filter((u) => where.id.in.includes(u.id))
  };
  return { filas, avisoMigracionZoom, usuario };
}
