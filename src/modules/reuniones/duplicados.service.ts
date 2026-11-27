import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import {
  claveRevisionDuplicado,
  detectarPosiblesReunionesDuplicadas,
  esDecisionRevisionDuplicado,
  huellaRevisionDuplicado,
  type CandidataReunionDuplicada,
  type DecisionRevisionDuplicado,
  type PosibleReunionDuplicada,
} from "./duplicados.domain";

const AUDIT_ENTITY = "POSIBLE_DUPLICADO_REUNION";

const revisionSchema = z
  .object({
    izquierdaId: z.string().min(1),
    derechaId: z.string().min(1),
    decision: z.enum(["REQUIERE_ACTUALIZACION", "FALSO_POSITIVO"]),
  })
  .refine(({ izquierdaId, derechaId }) => izquierdaId !== derechaId, {
    message: "La comparación requiere dos reuniones distintas.",
  });

const candidateSelect = {
  id: true,
  inicioProgramadoAt: true,
  finProgramadoAt: true,
  solicitud: {
    select: {
      id: true,
      titulo: true,
      docentePrograma: {
        select: {
          programa: { select: { id: true, nombre: true } },
          docente: {
            select: { usuario: { select: { id: true, nombres: true, apellidos: true } } },
          },
        },
      },
    },
  },
} satisfies Prisma.InstanciaSalaSelect;

type CandidateRow = Prisma.InstanciaSalaGetPayload<{ select: typeof candidateSelect }>;

export type CasoRevisionDuplicado = PosibleReunionDuplicada &
  Readonly<{
    clave: string;
    decision: DecisionRevisionDuplicado | null;
    revisadoAt: Date | null;
  }>;

export async function listarCasosRevisionDuplicados(
  _database: PrismaClient,
  _ahora: Date,
): Promise<readonly CasoRevisionDuplicado[]> {
  // Funcionalidad de detección de duplicados deprecada: se conserva el contrato
  // para no romper rutas o integraciones existentes, pero no ejecuta consultas.
  return [];
}

export async function revisarPosibleDuplicado(
  database: PrismaClient,
  actor: SessionActor,
  rawInput: unknown,
): Promise<void> {
  if (actor.rol !== "ADMINISTRACION") {
    throw new Error("Solo Administración puede revisar duplicados.");
  }
  const input = revisionSchema.parse(rawInput);
  const meetings = await database.instanciaSala.findMany({
    where: { id: { in: [input.izquierdaId, input.derechaId] } },
    select: candidateSelect,
  });
  if (meetings.length !== 2) {
    throw new Error("Una de las reuniones ya no existe.");
  }

  const risks = detectarPosiblesReunionesDuplicadas(meetings.map(toCandidate));
  const key = claveRevisionDuplicado(input.izquierdaId, input.derechaId);
  const risk = risks.find(
    ({ izquierda, derecha }) => claveRevisionDuplicado(izquierda.id, derecha.id) === key,
  );
  if (!risk) {
    throw new Error("Las reuniones ya no cumplen las condiciones de posible duplicado.");
  }

  const previous = await database.auditoria.findFirst({
    where: { entidadTipo: AUDIT_ENTITY, entidadId: key },
    orderBy: { createdAt: "desc" },
    select: { valorNuevo: true },
  });
  const previousDecision = readDecision(previous?.valorNuevo ?? null);
  await database.auditoria.create({
    data: {
      actorUsuarioId: actor.id,
      accion: "REVISAR_POSIBLE_DUPLICADO",
      entidadTipo: AUDIT_ENTITY,
      entidadId: key,
      valorAnterior: previousDecision ? { decision: previousDecision } : undefined,
      valorNuevo: {
        decision: input.decision,
        fingerprint: huellaRevisionDuplicado(risk),
        izquierdaId: input.izquierdaId,
        derechaId: input.derechaId,
      },
    },
  });
}

function toCandidate(meeting: CandidateRow): CandidataReunionDuplicada {
  const association = meeting.solicitud.docentePrograma;
  const teacher = association.docente.usuario;
  return {
    id: meeting.id,
    solicitudId: meeting.solicitud.id,
    titulo: meeting.solicitud.titulo,
    programaId: association.programa.id,
    programaNombre: association.programa.nombre,
    docenteId: teacher.id,
    docenteNombre: [teacher.nombres, teacher.apellidos].filter(Boolean).join(" "),
    inicio: meeting.inicioProgramadoAt,
    fin: meeting.finProgramadoAt,
  };
}

function readDecision(value: Prisma.JsonValue | null): DecisionRevisionDuplicado | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const decision = value["decision"];
  return esDecisionRevisionDuplicado(decision) ? decision : null;
}
