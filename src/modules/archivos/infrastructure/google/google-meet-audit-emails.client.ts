import { JWT } from "google-auth-library";
import { crearGoogleAuthJwt, conReintentosGoogleLectura } from "@/src/integrations/google";

/**
 * Complemento de auditoría: solo devuelve correos que Google identificó
 * explícitamente como email_address. No intenta inferir emails por nombre.
 */
export type CorreoAuditadoMeet = Readonly<{
  correo: string;
  externo: boolean | null;
  conferenciaId: string;
  nombre?: string;
  salida?: string;
  duracionSegundos?: number;
  conexiones?: readonly { inicio: string; fin: string; duracionSegundos: number; nombre: string; identificador: string }[];
}>;

type Parametro = { name: string; value?: string; intValue?: string; boolValue?: boolean };
type Actividad = {
  id?: { time?: string };
  events?: Array<{ name: string; parameters?: Parametro[] }>;
};
type Pagina = { items?: Actividad[]; nextPageToken?: string };

export async function obtenerCorreosAuditoriaMeet(input: {
  serviceAccountEmail: string;
  privateKey: string;
  adminEmail: string;
  meetingCode: string;
  startTime: string;
  endTime: string;
}): Promise<readonly CorreoAuditadoMeet[]> {
  const auth: JWT = crearGoogleAuthJwt(
    {
      serviceAccountEmail: input.serviceAccountEmail,
      privateKey: input.privateKey,
      subject: input.adminEmail
    },
    ["https://www.googleapis.com/auth/admin.reports.audit.readonly"]
  );
  const start = new Date(input.startTime);
  const end = new Date(input.endTime);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    throw new Error("Intervalo de auditoría inválido");
  }
  const normalizeCode = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const code = normalizeCode(input.meetingCode);
  const emails = new Map<string, CorreoAuditadoMeet>();
  let token: string | undefined;
  do {
    const params = new URLSearchParams({
      eventName: "call_ended",
      startTime: start.toISOString(),
      endTime: new Date(end.getTime() + 120 * 60_000).toISOString(),
      maxResults: "1000"
    });
    if (token) params.set("pageToken", token);
    const response = await conReintentosGoogleLectura(() => auth.request<Pagina>({
      url: `https://admin.googleapis.com/admin/reports/v1/activity/users/all/applications/meet?${params}`,
      method: "GET",
      timeout: 20_000
    }));
    for (const item of response.data.items ?? []) {
      for (const event of item.events ?? []) {
        if (event.name !== "call_ended") continue;
        const p = new Map((event.parameters ?? []).map(v => [v.name, v]));
        const val = (key: string) => p.get(key)?.value ?? p.get(key)?.intValue ?? "";
        if (normalizeCode(String(val("meeting_code"))) !== code) continue;
        if (val("identifier_type") !== "email_address") continue;
        const correo = String(val("identifier")).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) continue;
        const conferenceId = String(val("conference_id"));
        const external = p.get("is_external")?.boolValue;
        const key = `${conferenceId}|${correo}`;
        const previous = emails.get(key);
        const seconds = Number(val("duration_seconds")) || 0;
        const exitTime = item.id?.time ?? "";
        const inicioCalculado = Number.isFinite(Date.parse(exitTime)) && seconds > 0
          ? new Date(Date.parse(exitTime) - seconds * 1000).toISOString()
          : "";
        const registro = { inicio: inicioCalculado, fin: exitTime, duracionSegundos: seconds, nombre: String(val("display_name")), identificador: correo };
        emails.set(key, {
          correo,
          externo: typeof external === "boolean" ? external : null,
          conferenciaId: conferenceId,
          nombre: String(val("display_name")) || previous?.nombre || "",
          salida: exitTime || previous?.salida || "",
          duracionSegundos: (previous?.duracionSegundos ?? 0) + Math.max(0, seconds),
          conexiones: [...(previous?.conexiones ?? []), registro]
        });
      }
    }
    token = response.data.nextPageToken || undefined;
  } while (token);
  return [...emails.values()].sort((a, b) => a.correo.localeCompare(b.correo));
}
